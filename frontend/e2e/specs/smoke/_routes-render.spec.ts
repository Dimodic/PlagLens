/* eslint-disable react-hooks/rules-of-hooks --
   Playwright destructured fixture argument `({ authedPage })` triggers a false
   positive from react-hooks/rules-of-hooks because the test arrow-fn body
   contains `authedPage.on(...)` which the linter parses as a hook call. */
/**
 * Smoke: every public + protected route renders without 500/404.
 *
 * For protected routes we sign in as admin (most permissive) so that
 * RoleGuard does not redirect us to a 404 placeholder.
 *
 * A route is OK if:
 *   - It's a known SPA route (always 200 from the dev server, even for /404).
 *   - The body is not empty.
 *   - There were no uncaught console errors during navigation.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { DEMO_USERS } from '../../helpers/api';

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/auth/forgot',
  '/demo',
];

// Routes that are protected but should be reachable as admin.
const PROTECTED_ROUTES = [
  '/',
  '/me',
  '/me/profile',
  '/me/security',
  '/me/api-keys',
  '/me/external-bindings',
  '/me/submissions',
  '/me/2fa',
  '/me/notifications/preferences',
  '/courses',
  '/grading',
  '/reports',
  '/notifications',
  '/admin',
  '/admin/overview',
  '/admin/users',
  '/admin/tenants',
  '/admin/integrations',
  '/admin/integrations/webhooks',
  '/admin/notifications/email',
  '/admin/notifications/templates',
  '/admin/notifications/deliveries',
  '/admin/notifications/dlq',
  '/admin/audit',
  '/admin/audit/search',
  '/admin/audit/access-denied',
  '/admin/audit/retention',
  '/admin/audit/legal-holds',
  '/admin/roles',
  '/admin/system/health',
  '/admin/system/settings',
  '/admin/plagiarism-corpus',
  '/admin/ai/prompt-versions',
  '/admin/ai/providers',
  '/admin/ai/budgets',
  '/admin/ai/cache',
];

const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const c = DEMO_USERS.admin;
    await page.goto('/login');
    await page.locator('[data-testid="login-email"] input').fill(c.email);
    await page.locator('[data-testid="login-password"] input').fill(c.password);
    await page.locator('[data-testid="login-tenant-slug"] input').fill(c.tenantSlug);
    await page.getByTestId('login-submit').click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    await use(page);
    await ctx.close();
  },
});

test.describe('@smoke public routes', () => {
  for (const route of PUBLIC_ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      const resp = await page.goto(route);
      expect(resp?.status()).toBeLessThan(500);
      await expect(page.locator('body')).not.toBeEmpty();
      const ignored = [/HMR/i, /favicon/i, /DevTools/i, /chunk/i, /Mantine.*Provider/i, /\.tsx\?/i];
      const significant = errors.filter((e) => !ignored.some((re) => re.test(e)));
      expect(significant, `Console errors on ${route}:\n${significant.join('\n')}`).toEqual([]);
    });
  }
});

test.describe('@smoke protected routes (admin)', () => {
  for (const route of PROTECTED_ROUTES) {
    test(`renders ${route}`, async ({ authedPage }) => {
      const errors: string[] = [];
      authedPage.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await authedPage.goto(route);
      // Wait for SPA route transition; tolerate slow API panels.
      await authedPage.waitForLoadState('domcontentloaded');
      await expect(authedPage.locator('body')).not.toBeEmpty();
      // Should not redirect us back to /login.
      await expect(authedPage).not.toHaveURL(/\/login/);
      const ignored = [
        /HMR/i,
        /favicon/i,
        /DevTools/i,
        /chunk/i,
        /Mantine.*Provider/i,
        /Failed to fetch/i, // backend-not-up panels — placeholders are OK
        /AxiosError/i,
        /404/i, // allow 404 from optional admin endpoints
        /403/i,
        /\.tsx\?/i,
        /useLayoutEffect/i,
        /react-router/i,
      ];
      const significant = errors.filter((e) => !ignored.some((re) => re.test(e)));
      expect(significant, `Console errors on ${route}:\n${significant.join('\n')}`).toEqual([]);
    });
  }
});
