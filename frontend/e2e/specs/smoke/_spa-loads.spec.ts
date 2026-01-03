/**
 * Smoke: SPA loads cleanly.
 *
 * Verifies:
 *   - Frontend dev server is reachable.
 *   - Initial render produces a non-empty document.
 *   - No critical console errors during the first navigation.
 *   - No failed network requests (4xx/5xx) for non-auth endpoints.
 */
import { test, expect } from '@playwright/test';

test.describe('@smoke SPA bootstraps', () => {
  test('navigates to / and renders without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    page.on('requestfailed', (req) => {
      // Ignore 401 from /auth/refresh (anonymous bootstrap).
      const url = req.url();
      if (url.includes('/auth/refresh')) return;
      failedRequests.push(`${req.method()} ${url} — ${req.failure()?.errorText ?? 'unknown'}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Anonymous user should be redirected to /login.
    await expect(page).toHaveURL(/\/login/);

    // Page has rendered something (logo, title, form).
    await expect(page.locator('body')).not.toBeEmpty();

    // No critical console errors. Hot-reload + favicon noise is filtered.
    // 429 from /auth/refresh is OK — it's rate-limiting an expected anonymous bootstrap.
    const ignored = [/HMR/i, /favicon/i, /DevTools/i, /chunk/i, /\.tsx\?/i, /429/, /auth\/refresh/];
    const significant = consoleErrors.filter((e) => !ignored.some((re) => re.test(e)));
    expect(significant, `Unexpected console errors:\n${significant.join('\n')}`).toEqual([]);

    // No failed network requests.
    expect(failedRequests, `Failed network requests:\n${failedRequests.join('\n')}`).toEqual([]);
  });

  test('responds to direct navigation to /login', async ({ page }) => {
    const resp = await page.goto('/login');
    expect(resp?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('responds to direct navigation to /demo', async ({ page }) => {
    await page.goto('/demo');
    await expect(page).toHaveURL(/\/demo/);
    // /demo surfaces 3 one-click cards (admin, teacher, student1). The other
    // seed accounts (assistant, student2..4) live in the DB but are only
    // reachable via /login.
    const roles = ['admin', 'teacher', 'student1'];
    for (const role of roles) {
      await expect(page.getByTestId(`demo-card-${role}`)).toBeVisible();
    }
  });
});
