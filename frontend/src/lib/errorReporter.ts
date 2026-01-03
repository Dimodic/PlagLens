/**
 * errorReporter — capture all client-side errors and forward them to gateway.
 *
 * Hooks installed:
 *   1. window.onerror             → uncaught JS exceptions
 *   2. window.onunhandledrejection → unhandled promise rejections
 *   3. console.error              → wrapped to also forward
 *   4. axios response interceptor → 4xx/5xx network errors (in client.ts)
 *   5. React ErrorBoundary        → component-tree crashes (in App.tsx)
 *   6. errorReporter.report()     → manual reports from anywhere
 *
 * All reports go to POST /api/v1/_debug/client-errors which logs them via
 * structlog so they appear in `docker logs plaglens-gateway`.
 *
 * Anti-loop: failures of the reporter itself are **silently swallowed** —
 * we never call console.error from within errorReporter, otherwise we'd
 * recurse indefinitely.
 */

export type ErrorType =
  | 'window_error'
  | 'unhandled_rejection'
  | 'console'
  | 'network'
  | 'react'
  | 'manual';

export interface ClientErrorPayload {
  type: ErrorType;
  message: string;
  stack?: string;
  url?: string;
  user_agent?: string;
  role?: string;
  extra?: Record<string, unknown>;
}

const ENDPOINT = '/api/v1/_debug/client-errors';

// Skip reporting for known noise.
const SKIP_PATTERNS: RegExp[] = [
  /ResizeObserver loop/i,                  // benign Chrome quirk
  /Non-Error promise rejection captured/i, // legacy/library noise
  /Loading chunk \d+ failed/i,             // chunk-load races (already handled by SW)
];

function shouldSkip(message: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(message));
}

let currentRole: string | null = null;
export function setReporterRole(role: string | null): void {
  currentRole = role;
}

const queue: ClientErrorPayload[] = [];
const MAX_QUEUE = 50;
let flushing = false;
const FLUSH_INTERVAL_MS = 1000;

async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  for (const err of batch) {
    try {
      await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(err),
        credentials: 'omit',
        keepalive: true,
      });
    } catch {
      // swallow — never console.error here, it would loop
    }
  }
  flushing = false;
}

// Periodic flush (in case keepalive lazily delivers).
let flushTimer: ReturnType<typeof setInterval> | null = null;
function startFlushTimer(): void {
  if (flushTimer) return;
  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
}

function enqueue(payload: ClientErrorPayload): void {
  if (shouldSkip(payload.message)) return;
  if (queue.length >= MAX_QUEUE) {
    // drop oldest
    queue.shift();
  }
  queue.push({
    ...payload,
    url: payload.url ?? window.location.href,
    user_agent: payload.user_agent ?? navigator.userAgent,
    role: payload.role ?? currentRole ?? undefined,
  });
  // fire-and-forget flush; periodic timer covers any misses
  void flush();
}

export const errorReporter = {
  report(
    type: ErrorType,
    message: string,
    opts?: { stack?: string; extra?: Record<string, unknown>; role?: string },
  ): void {
    enqueue({
      type,
      message: String(message).slice(0, 4000),
      stack: opts?.stack?.slice(0, 20_000),
      role: opts?.role,
      extra: opts?.extra,
    });
  },
};

let installed = false;

export function installErrorReporter(): void {
  if (installed) return;
  installed = true;

  // 1. window.onerror
  window.addEventListener('error', (e) => {
    enqueue({
      type: 'window_error',
      message: String(e.message ?? 'unknown error').slice(0, 4000),
      stack: e.error instanceof Error ? e.error.stack?.slice(0, 20_000) : undefined,
      extra: {
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
      },
    });
  });

  // 2. unhandled promise rejection
  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason;
    let message: string;
    let stack: string | undefined;
    if (reason instanceof Error) {
      message = reason.message;
      stack = reason.stack;
    } else if (typeof reason === 'object' && reason !== null) {
      try {
        message = JSON.stringify(reason);
      } catch {
        message = String(reason);
      }
    } else {
      message = String(reason);
    }
    enqueue({
      type: 'unhandled_rejection',
      message: message.slice(0, 4000),
      stack: stack?.slice(0, 20_000),
    });
  });

  // 3. console.error wrapper — forward without recursion.
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origConsoleError(...args);
    try {
      const message = args
        .map((a) => {
          if (a instanceof Error) return a.message;
          if (typeof a === 'object') {
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(' ');
      const errArg = args.find((a) => a instanceof Error) as Error | undefined;
      enqueue({
        type: 'console',
        message: message.slice(0, 4000),
        stack: errArg?.stack?.slice(0, 20_000),
      });
    } catch {
      // never recurse
    }
  };

  startFlushTimer();
}
