/**
 * Raw HTTP API client for E2E tests — used in setup, teardown, and as a
 * shortcut to skip slow UI flows (e.g. seeding, authenticating). Uses
 * Playwright's APIRequestContext so cookies and tracing are first-class.
 *
 * For UI test bodies prefer Page Object methods; this helper is for plumbing.
 */
import { request, type APIRequestContext, type APIResponse } from '@playwright/test';

// Playwright's APIRequestContext interprets absolute paths (leading '/') as
// path-only — so we keep baseURL host-only and explicitly prefix '/api/v1'.
export const API_HOST = process.env.E2E_API_HOST ?? 'http://localhost:5173';
export const API_PREFIX = process.env.E2E_API_PREFIX ?? '/api/v1';
export const API_BASE_URL = `${API_HOST}${API_PREFIX}`;
export const DEMO_TENANT_SLUG = process.env.E2E_DEMO_TENANT_SLUG ?? 'demo-hse';
export const SYSTEM_TENANT_SLUG = process.env.E2E_SYSTEM_TENANT_SLUG ?? 'system';

export interface DemoCredentials {
  email: string;
  password: string;
  tenantSlug: string;
}

export const DEMO_USERS: Record<string, DemoCredentials> = {
  super_admin: {
    email: process.env.E2E_SUPER_ADMIN_EMAIL ?? 'admin@plaglens.local',
    password: process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'changeme',
    tenantSlug: SYSTEM_TENANT_SLUG,
  },
  admin: {
    email: 'admin@demo.local',
    password: 'admin',
    tenantSlug: DEMO_TENANT_SLUG,
  },
  teacher: {
    email: 'teacher@demo.local',
    password: 'teacher',
    tenantSlug: DEMO_TENANT_SLUG,
  },
  assistant: {
    email: 'assistant@demo.local',
    password: 'assistant',
    tenantSlug: DEMO_TENANT_SLUG,
  },
  student1: {
    email: 'student1@demo.local',
    password: 'student',
    tenantSlug: DEMO_TENANT_SLUG,
  },
  student2: {
    email: 'student2@demo.local',
    password: 'student',
    tenantSlug: DEMO_TENANT_SLUG,
  },
  student3: {
    email: 'student3@demo.local',
    password: 'student',
    tenantSlug: DEMO_TENANT_SLUG,
  },
  student4: {
    email: 'student4@demo.local',
    password: 'student',
    tenantSlug: DEMO_TENANT_SLUG,
  },
};

export type DemoRole = keyof typeof DEMO_USERS;

export class ApiClient {
  constructor(private readonly ctx: APIRequestContext, private accessToken: string | null = null) {}

  static async create(token?: string | null): Promise<ApiClient> {
    // Use API_HOST as baseURL and prefix paths with API_PREFIX, because
    // APIRequestContext treats leading-/ paths as host-relative (which
    // would strip our /api/v1 prefix).
    const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
    return new ApiClient(ctx, token ?? null);
  }

  private url(path: string): string {
    if (path.startsWith('http')) return path;
    return `${API_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
  }

  setToken(token: string | null) {
    this.accessToken = token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      ...extra,
    };
  }

  async get(path: string): Promise<APIResponse> {
    return this.ctx.get(this.url(path), { headers: this.headers() });
  }

  async post(path: string, body?: unknown): Promise<APIResponse> {
    return this.ctx.post(this.url(path), { headers: this.headers(), data: body });
  }

  async delete(path: string): Promise<APIResponse> {
    return this.ctx.delete(this.url(path), { headers: this.headers() });
  }

  /** Login through /auth/login. Returns the access token (and stores it).
   * Includes light retry-on-429 to keep parallel E2E robust against the
   * gateway's auth_sensitive rate limit. */
  async login(email: string, password: string, tenantSlug?: string): Promise<string> {
    const body: Record<string, unknown> = { email, password };
    if (tenantSlug) body.tenant_slug = tenantSlug;
    const maxAttempts = 6;
    let lastText = '';
    let lastStatus = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const resp = await this.ctx.post(this.url('/auth/login'), {
        headers: this.headers(),
        data: body,
      });
      if (resp.ok()) {
        const data = await resp.json();
        this.accessToken = data.access_token;
        return data.access_token;
      }
      lastStatus = resp.status();
      lastText = await resp.text();
      if (resp.status() !== 429) break;
      // Exponential-ish backoff with jitter to spread retries.
      const wait = 800 + attempt * 600 + Math.floor(Math.random() * 400);
      await new Promise((res) => setTimeout(res, wait));
    }
    throw new Error(`Login failed (${lastStatus}): ${lastText}`);
  }

  async loginAs(role: DemoRole): Promise<string> {
    const c = DEMO_USERS[role];
    return this.login(c.email, c.password, c.tenantSlug);
  }

  async me() {
    const resp = await this.get('/auth/me');
    if (!resp.ok()) throw new Error(`me() failed: ${resp.status()}`);
    return resp.json();
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }
}

/**
 * Wait until the gateway responds to a known endpoint with a JSON body.
 *
 * We probe `POST /api/v1/auth/login` with no body — the gateway should
 * return 422 (validation), proving it routes the request to the identity
 * backend. Any JSON response (200/4xx) from a problem+json content-type
 * counts as "alive". 5xx and HTML fallthrough are NOT alive.
 */
export async function waitForGatewayHealthy(timeoutMs = 30_000): Promise<void> {
  const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = null;
  try {
    while (Date.now() < deadline) {
      try {
        const r = await ctx.post(`${API_PREFIX}/auth/login`, { data: {} });
        const ct = r.headers()['content-type'] ?? '';
        if (r.status() < 500 && (ct.includes('json') || ct.includes('problem'))) return;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((res) => setTimeout(res, 1_000));
    }
  } finally {
    await ctx.dispose();
  }
  throw new Error(`Gateway did not become healthy within ${timeoutMs}ms: ${lastErr ?? 'unknown'}`);
}

/**
 * Wait until the frontend dev server (or static host) responds. We just check
 * the document loads — Vite returns 200 for /index.html in dev mode.
 */
export async function waitForFrontendHealthy(
  baseUrl = 'http://localhost:5173',
  timeoutMs = 30_000,
): Promise<void> {
  const ctx = await request.newContext({ baseURL: baseUrl, ignoreHTTPSErrors: true });
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      try {
        const r = await ctx.get('/');
        if (r.ok()) return;
      } catch {
        // retry
      }
      await new Promise((res) => setTimeout(res, 1_000));
    }
  } finally {
    await ctx.dispose();
  }
  throw new Error(`Frontend did not become healthy within ${timeoutMs}ms`);
}
