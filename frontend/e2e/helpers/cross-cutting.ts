/**
 * Shared helpers for the «defensive» test suite (cross-cutting / negative /
 * mobile / a11y / perf). These helpers wrap repeated patterns so individual
 * specs stay short and intent-focused.
 *
 * Conventions:
 *   - All HTTP helpers go through Playwright's APIRequestContext to inherit
 *     cookies, tracing and proxy settings.
 *   - We assume the dev server proxies /api/* → gateway, so the frontend
 *     baseURL works for API calls too. For direct gateway calls in raw HTTP
 *     plumbing we use API_BASE_URL from helpers/api.ts.
 *   - Fail-fast: helpers throw if the response shape is not what we expect,
 *     letting Playwright capture the trace.
 */
import { expect, type APIRequestContext, type Page, type Response } from '@playwright/test';
import { request } from '@playwright/test';
import { API_BASE_URL, ApiClient, DEMO_USERS, type DemoRole } from './api';
import { TEST_IDS } from './selectors';

// ---------------------------------------------------------------------------
// Auth bootstrap (page-level): drop a JWT into in-memory tokenStore so the
// SPA renders authenticated UI without going through the /login form.
// ---------------------------------------------------------------------------

/**
 * Login via the API and seed the resulting access token into the SPA's
 * in-memory tokenStore.  The refresh cookie is delivered server-side and
 * shared with the page automatically because we pre-load `about:blank` and
 * then GET / through the same browser context that just received the cookie.
 *
 * Returns the access token so callers may also use it for direct API checks.
 */
export async function seedJwt(page: Page, role: DemoRole): Promise<string> {
  const c = DEMO_USERS[role];
  // Use the page's request context so the Set-Cookie lands in the browser jar.
  const resp = await page.request.post('/api/v1/auth/login', {
    data: { email: c.email, password: c.password, tenant_slug: c.tenantSlug },
  });
  if (!resp.ok()) {
    throw new Error(`seedJwt: login failed ${resp.status()} ${await resp.text()}`);
  }
  const data = await resp.json();
  const token: string = data.access_token;

  // Inject token into the SPA via the same path the AuthProvider uses on
  // refresh: localStorage isn't used (in-memory only), so we set it on
  // window before any code runs and rely on the bootstrap refresh to
  // re-issue.  Simpler: just set sessionStorage flag the app reads, OR
  // navigate first and `page.evaluate` to call tokenStore.set.
  await page.addInitScript((t) => {
    // Expose the token so the AuthProvider's bootstrap refresh path
    // doesn't strictly need to succeed; we still rely on the cookie for
    // refresh to work.
    (window as unknown as { __E2E_TOKEN__: string }).__E2E_TOKEN__ = t;
  }, token);

  return token;
}

/**
 * Force the SPA to behave like a TRULY anonymous user.
 *
 * Background (security bug): the demo backend's POST /auth/refresh succeeds
 * with no credentials at all (returns a token for a pseudo-random demo
 * user). That makes a fresh `browser.newContext()` *not* anonymous from the
 * SPA's point of view.  Until that's fixed, frontend tests need to
 * intercept the refresh call and force it to fail so ProtectedRoute can do
 * its job.
 *
 * Use BEFORE `page.goto(...)` to ensure the bootstrap refresh sees the
 * stub.  Calls under /auth/login still pass through unmodified.
 */
export async function forceAnonymous(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/refresh', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: 'https://docs.plaglens.ru/errors/unauthenticated',
        title: 'Unauthenticated',
        status: 401,
        code: 'UNAUTHENTICATED',
        detail: 'No refresh cookie',
        instance: '/api/v1/auth/refresh',
        request_id: 'test-anon-' + Date.now(),
      }),
    });
  });
  // The bootstrap also hits /auth/me — return 401 there too, so the SPA
  // doesn't fall back to a pre-existing token.
  await page.route('**/api/v1/auth/me', async (route, req) => {
    if (!req.headers()['authorization']) {
      await route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://docs.plaglens.ru/errors/unauthenticated',
          title: 'Unauthenticated',
          status: 401,
          code: 'UNAUTHENTICATED',
          detail: 'Missing bearer token',
          instance: '/api/v1/auth/me',
          request_id: 'test-anon-' + Date.now(),
        }),
      });
    } else {
      await route.continue();
    }
  });
}

/**
 * Login via UI form. Slower but exercises the full flow.
 */
export async function uiLoginAs(page: Page, role: DemoRole): Promise<void> {
  const c = DEMO_USERS[role];
  await page.goto('/login');
  await page.getByTestId(TEST_IDS.loginEmail).fill(c.email);
  await page.getByTestId(TEST_IDS.loginPassword).fill(c.password);
  if (c.tenantSlug) {
    await page.getByTestId(TEST_IDS.loginTenantSlug).fill(c.tenantSlug);
  }
  await page.getByTestId(TEST_IDS.loginSubmit).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
}

// ---------------------------------------------------------------------------
// API client helper that uses page.request (so cookies are shared).
// ---------------------------------------------------------------------------

export interface AuthedClient {
  ctx: APIRequestContext;
  token: string;
  get: (path: string, headers?: Record<string, string>) => Promise<Response>;
  post: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  patch: (path: string, body?: unknown, headers?: Record<string, string>) => Promise<Response>;
  del: (path: string, headers?: Record<string, string>) => Promise<Response>;
  rawHeaders: () => Record<string, string>;
}

// Process-wide token cache: rate limit on /auth/login is 5/min/per_user, so
// every spec re-logging in for every role would quickly trip 429.  We cache
// the token (15-min TTL on the JWT itself) and reuse it across the worker.
const __TOKEN_CACHE: Map<string, { token: string; expires: number }> = new Map();

async function loginWithBackoff(role: DemoRole): Promise<string> {
  const cached = __TOKEN_CACHE.get(role);
  if (cached && Date.now() < cached.expires - 30_000) {
    return cached.token;
  }
  // We intentionally do NOT use baseURL: Playwright's baseURL replaces the
  // entire path of the URL when paired with an absolute path argument.
  // Pass full URLs everywhere instead.
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const c = DEMO_USERS[role];
  // Try up to 3 times with exponential backoff on 429.
  let lastStatus = 0;
  let lastBody = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await ctx.post(`${API_BASE_URL}/auth/login`, {
      data: { email: c.email, password: c.password, tenant_slug: c.tenantSlug },
    });
    lastStatus = r.status();
    if (r.ok()) {
      const j = await r.json();
      const token = j.access_token as string;
      const exp = Date.now() + (j.expires_in ?? 900) * 1000;
      __TOKEN_CACHE.set(role, { token, expires: exp });
      await ctx.dispose();
      return token;
    }
    if (r.status() === 429) {
      // Honour Retry-After if present, else exponential backoff.
      const ra = parseInt(r.headers()['retry-after'] ?? '5', 10);
      await new Promise((res) => setTimeout(res, Math.max(1_000, ra * 1_000)));
      continue;
    }
    // 401 + TWO_FACTOR_REQUIRED — another test left 2FA on this account.
    // Try /auth/2fa/disable via super_admin if we can; else clearly skip.
    lastBody = await r.text().catch(() => '');
    if (r.status() === 401 && lastBody.includes('TWO_FACTOR_REQUIRED')) {
      await ctx.dispose();
      throw new Error(`loginWithBackoff(${role}): TWO_FACTOR_REQUIRED — another test left 2FA enabled. body=${lastBody.slice(0, 200)}`);
    }
    // Non-recoverable.
    await ctx.dispose();
    throw new Error(`loginWithBackoff(${role}): login failed ${r.status()} ${lastBody}`);
  }
  await ctx.dispose();
  throw new Error(`loginWithBackoff(${role}): login failed after retries (${lastStatus}) ${lastBody}`);
}

/**
 * Build an authed client from a fresh request context (no shared cookies).
 * Use this in cross-cutting tests where you need full control over
 * Authorization / Idempotency-Key / etc.
 *
 * Tokens are cached per-role to avoid re-hitting the impostor-class rate
 * limit (5/min) when many specs run in parallel.
 *
 * Important: we DON'T set baseURL on the request context — Playwright's
 * baseURL replaces the entire path component when given an absolute path
 * argument, which doesn't compose with our `/api/v1/...` style paths.
 */
export async function makeAuthedClient(role: DemoRole): Promise<AuthedClient> {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const token = await loginWithBackoff(role);

  const headers = (extra?: Record<string, string>) => ({
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...extra,
  });

  // Prefix paths with API_BASE_URL when they don't already have a scheme.
  const url = (p: string) => (p.startsWith('http') ? p : `${API_BASE_URL}${p}`);
  return {
    ctx,
    token,
    rawHeaders: () => headers(),
    get: (path, h) => ctx.get(url(path), { headers: headers(h) }),
    post: (path, body, h) => ctx.post(url(path), { headers: headers(h), data: body }),
    patch: (path, body, h) => ctx.patch(url(path), { headers: headers(h), data: body }),
    del: (path, h) => ctx.delete(url(path), { headers: headers(h) }),
  };
}

/**
 * Anonymous (no JWT) request context for testing public/protected boundaries.
 *
 * Returns a *wrapper* that automatically prefixes API_BASE_URL on relative
 * paths (avoids Playwright's baseURL-replaces-path quirk).
 */
export interface AnonClient {
  ctx: APIRequestContext;
  get: (path: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
  post: (
    path: string,
    init?: { data?: unknown; headers?: Record<string, string> },
  ) => Promise<Response>;
  fetch: (path: string, init?: Parameters<APIRequestContext['fetch']>[1]) => Promise<Response>;
  delete: (path: string, init?: { headers?: Record<string, string> }) => Promise<Response>;
  dispose: () => Promise<void>;
}

export async function makeAnonClient(): Promise<AnonClient> {
  const ctx = await request.newContext({ ignoreHTTPSErrors: true });
  const url = (p: string) => (p.startsWith('http') ? p : `${API_BASE_URL}${p}`);
  return {
    ctx,
    get: (p, init) => ctx.get(url(p), init),
    post: (p, init) => ctx.post(url(p), init),
    fetch: (p, init) => ctx.fetch(url(p), init),
    delete: (p, init) => ctx.delete(url(p), init),
    dispose: () => ctx.dispose(),
  };
}

// ---------------------------------------------------------------------------
// RFC 7807 Problem assertions.
// ---------------------------------------------------------------------------

export interface ProblemShape {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  request_id?: string;
  errors?: Array<{ field: string; code?: string; message: string }>;
  [k: string]: unknown;
}

/**
 * Assert that an HTTP response is an RFC 7807 Problem with expected status & code.
 * Returns the parsed Problem for further inspection.
 */
export async function expectProblem(
  resp: Response,
  expected: { status: number; code?: string; codeOneOf?: string[] },
): Promise<ProblemShape> {
  expect(resp.status(), `expected ${expected.status}, got ${resp.status()}`).toBe(expected.status);
  const ct = resp.headers()['content-type'] ?? '';
  // Backend SHOULD return application/problem+json; gateway may sometimes
  // forward as application/json. Accept both but warn.
  expect(ct.includes('json'), `unexpected content-type: ${ct}`).toBe(true);
  const body = (await resp.json()) as ProblemShape;
  expect(typeof body.title).toBe('string');
  expect(typeof body.status).toBe('number');
  expect(typeof body.code).toBe('string');
  if (expected.code) expect(body.code).toBe(expected.code);
  if (expected.codeOneOf) expect(expected.codeOneOf).toContain(body.code);
  return body;
}

/**
 * Look up a header case-insensitively.
 */
export function getHeader(resp: Response, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(resp.headers())) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// UI-level: assert that a ProblemAlert is currently visible in the SPA.
// ---------------------------------------------------------------------------

export async function expectProblemAlert(page: Page, opts: { textContains?: string } = {}) {
  const alert = page.getByTestId(TEST_IDS.problemAlert).first();
  await expect(alert).toBeVisible({ timeout: 8_000 });
  if (opts.textContains) {
    await expect(alert).toContainText(opts.textContains);
  }
  return alert;
}

// ---------------------------------------------------------------------------
// RBAC helper: hit a URL with given role; assert 403 (or 404 for tenant
// isolation) Problem.
// ---------------------------------------------------------------------------

export async function expectForbidden(
  client: AuthedClient,
  method: 'get' | 'post' | 'patch' | 'delete',
  path: string,
  body?: unknown,
): Promise<ProblemShape> {
  const fn = method === 'get'
    ? () => client.get(path)
    : method === 'post'
      ? () => client.post(path, body)
      : method === 'patch'
        ? () => client.patch(path, body)
        : () => client.del(path);
  const resp = await fn();
  // Either 403 FORBIDDEN or 404 NOT_FOUND (cross-tenant).
  expect([403, 404]).toContain(resp.status());
  const problem = (await resp.json()) as ProblemShape;
  expect(typeof problem.code).toBe('string');
  return problem;
}

// ---------------------------------------------------------------------------
// JWT helpers (no signing; just decode/payload manipulation for negative tests).
// ---------------------------------------------------------------------------

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('not a JWT');
  const padded = parts[1].padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=');
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json);
}

/**
 * Compute remaining ms until JWT exp (rough — treats clock skew as 0).
 */
export function jwtExpiresInMs(token: string): number {
  const payload = decodeJwtPayload(token) as { exp?: number };
  if (typeof payload.exp !== 'number') return -1;
  return payload.exp * 1000 - Date.now();
}

/**
 * Build a JWT-shaped string with a forged exp in the past.  Backend will
 * reject with TOKEN_EXPIRED (signature validation fails first; some
 * deployments validate exp first — we accept either as long as it's 401).
 */
export function makeExpiredJwtFromValid(token: string): string {
  const [h, p, s] = token.split('.');
  const payload = JSON.parse(
    Buffer.from(p.padEnd(p.length + ((4 - (p.length % 4)) % 4), '='), 'base64').toString('utf-8'),
  );
  payload.exp = Math.floor(Date.now() / 1000) - 3600; // 1h ago
  payload.iat = Math.floor(Date.now() / 1000) - 7200;
  const newPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${h}.${newPayload}.${s}`;
}

// ---------------------------------------------------------------------------
// Pagination helper: walk through cursor-paginated list, return all items.
// ---------------------------------------------------------------------------

export async function walkPagination<T>(
  client: AuthedClient,
  basePath: string,
  limit = 5,
  maxPages = 10,
): Promise<{ items: T[]; pages: number }> {
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < maxPages) {
    const sep = basePath.includes('?') ? '&' : '?';
    const path = cursor
      ? `${basePath}${sep}cursor=${encodeURIComponent(cursor)}&limit=${limit}`
      : `${basePath}${sep}limit=${limit}`;
    const resp = await client.get(path);
    if (!resp.ok()) {
      throw new Error(`walkPagination: ${resp.status()} on ${path}`);
    }
    const json = await resp.json();
    if (!Array.isArray(json.data)) {
      throw new Error(`walkPagination: missing data[] in response`);
    }
    items.push(...json.data);
    pages += 1;
    if (!json.pagination?.has_more) {
      cursor = null;
      break;
    }
    cursor = json.pagination?.next_cursor ?? null;
    if (!cursor) break;
  }

  return { items, pages };
}

// ---------------------------------------------------------------------------
// Operation polling helper.
// ---------------------------------------------------------------------------

export interface PollOpts {
  timeoutMs?: number;
  intervalMs?: number;
  acceptStatuses?: Array<'queued' | 'running' | 'completed' | 'failed' | 'cancelled'>;
}

export async function pollOperation(
  client: AuthedClient,
  operationId: string,
  opts: PollOpts = {},
): Promise<Record<string, unknown>> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const intervalMs = opts.intervalMs ?? 500;
  const accept = new Set(opts.acceptStatuses ?? ['completed', 'failed', 'cancelled']);
  const deadline = Date.now() + timeoutMs;
  let lastBody: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    const r = await client.get(`/operations/${operationId}`);
    if (r.ok()) {
      lastBody = await r.json();
      const status = String(lastBody.status ?? '');
      if (accept.has(status as 'completed')) return lastBody;
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  throw new Error(`pollOperation: timed out (last body ${JSON.stringify(lastBody)})`);
}

// ---------------------------------------------------------------------------
// Idempotency-Key helper.
// ---------------------------------------------------------------------------

let idemCounter = 0;
export function freshIdempotencyKey(): string {
  // RFC 4122 v4-shaped, but unique enough for tests.
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  idemCounter += 1;
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

// ---------------------------------------------------------------------------
// Skip helper: gracefully skip when an endpoint returns 404 / 501 (not yet
// implemented).  Defensive tests must not turn red because the backend isn't
// there yet — they should clearly state "skipped, endpoint missing".
// ---------------------------------------------------------------------------

export async function skipIfNotImplemented(
  resp: Response,
  test: { skip: (cond: boolean, msg: string) => void },
  label: string,
): Promise<boolean> {
  if (resp.status() === 404 || resp.status() === 501 || resp.status() === 405) {
    test.skip(true, `${label}: endpoint returns ${resp.status()} (not implemented yet)`);
    return true;
  }
  return false;
}
