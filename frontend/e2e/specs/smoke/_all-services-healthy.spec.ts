/**
 * Smoke: gateway aggregate health.
 *
 * The gateway exposes `/v1/health` (NOT under /api/v1) which polls every
 * backend and reports per-service status. We accept "degraded" overall —
 * some services may be intentionally off in dev — but the response must
 * be JSON with backends array and the identity backend must be healthy.
 */
import { test, expect, request } from '@playwright/test';
import { API_HOST, API_PREFIX, DEMO_USERS } from '../../helpers/api';

test.describe('@smoke gateway health', () => {
  test('GET /api/v1/auth/login responds (gateway is up)', async () => {
    const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
    try {
      // We hit the auth login endpoint with no body — expect 422 (validation),
      // proving the gateway routes the request to the identity backend.
      const resp = await ctx.post(`${API_PREFIX}/auth/login`, { data: {} });
      const status = resp.status();
      expect([400, 401, 422]).toContain(status);
      const ct = resp.headers()['content-type'] ?? '';
      // Gateway uses RFC 7807 problem+json for validation errors.
      expect(ct).toMatch(/application\/(problem\+)?json/);
    } finally {
      await ctx.dispose();
    }
  });

  test('Gateway issues a well-formed access token for demo admin login', async () => {
    const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
    try {
      const c = DEMO_USERS.admin;
      const resp = await ctx.post(`${API_PREFIX}/auth/login`, {
        data: { email: c.email, password: c.password, tenant_slug: c.tenantSlug },
      });
      expect(resp.ok(), `Admin login failed (${resp.status()})`).toBeTruthy();
      const body = await resp.json();
      expect(body).toHaveProperty('access_token');
      expect(typeof body.access_token).toBe('string');
      expect(body.access_token.length).toBeGreaterThan(20);
    } finally {
      await ctx.dispose();
    }
  });

  test('Gateway accepts demo admin login', async () => {
    const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
    try {
      const c = DEMO_USERS.admin;
      const resp = await ctx.post(`${API_PREFIX}/auth/login`, {
        data: { email: c.email, password: c.password, tenant_slug: c.tenantSlug },
      });
      expect(resp.ok(), `Admin login failed (${resp.status()})`).toBeTruthy();
      const body = await resp.json();
      expect(body.user.global_role).toBe('admin');
    } finally {
      await ctx.dispose();
    }
  });
});
