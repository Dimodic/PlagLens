/**
 * Anonymous access — every protected route redirects to /login;
 * every protected API returns 401.
 */
import { test, expect } from '@playwright/test';
import { makeAnonClient, expectProblem, forceAnonymous } from '../../helpers/cross-cutting';

const PROTECTED_ROUTES = [
  '/',
  '/me',
  '/me/profile',
  '/courses',
  '/courses/new',
  '/admin',
  '/admin/tenants',
  '/admin/users',
  '/admin/audit',
  '/notifications',
  '/reports',
];

const PROTECTED_API_PATHS = [
  '/auth/me',
  '/courses',
  '/users',
  '/operations',
  '/audit/access-denied',
];

test.describe('Anonymous access redirected to /login', () => {
  for (const route of PROTECTED_ROUTES) {
    test(`route ${route} → redirect /login`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      // Workaround: dev backend's /auth/refresh always succeeds → block it.
      await forceAnonymous(page);
      await page.goto(route);
      await page.waitForURL((u) => u.pathname === '/login', { timeout: 15_000 });
      expect(page.url()).toMatch(/\/login(\?|$)/);
      await ctx.close();
    });
  }
});

test.describe('Anonymous API calls return 401', () => {
  for (const apiPath of PROTECTED_API_PATHS) {
    test(`GET ${apiPath} → 401`, async () => {
      const ctx = await makeAnonClient();
      const r = await ctx.get(apiPath);
      expect(r.status()).toBe(401);
      await expectProblem(r, { status: 401 });
      await ctx.dispose();
    });
  }
});

test.describe('Anonymous → public endpoints OK', () => {
  test('GET /healthz is open', async ({ request }) => {
    // /healthz lives at the root, NOT under /api/v1.
    const r = await request.get('/healthz');
    expect([200, 503]).toContain(r.status());
  });
});
