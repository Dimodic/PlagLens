/**
 * Auth: logout invalidates the session.
 *
 * Coverage:
 *   - Clicking logout from the user menu redirects to /login
 *   - The refresh cookie is invalidated server-side: a follow-up refresh
 *     attempt returns 401 and an attempt to view a protected page bounces.
 */
import { test, expect } from '@playwright/test';
import { LoginPagePo } from '../../pages/LoginPage.po';
import { DEMO_USERS } from '../../helpers/api';
import { TEST_IDS } from '../../helpers/selectors';

test.describe('@auth logout', () => {
  test('user menu logout returns to /login and clears session', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    const c = DEMO_USERS.admin;
    await lp.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
    await lp.submit.click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
    await expect(page.getByTestId(TEST_IDS.headerUserMenuTrigger)).toBeVisible();

    // Open user menu → click "Выйти". Wait for the logout request to settle.
    const logoutResp = page.waitForResponse(
      (r) => r.url().includes('/auth/logout') && r.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await page.getByTestId(TEST_IDS.headerUserMenuTrigger).click();
    await page.getByTestId(TEST_IDS.headerUserMenuLogout).click();
    const lr = await logoutResp;
    // 200 or 204 are both acceptable.
    expect(lr.status()).toBeLessThan(400);
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // Visiting a protected URL should not bring us back without re-login.
    await page.goto('/me/profile');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test('refresh after logout returns 401', async ({ page, request }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    const c = DEMO_USERS.admin;
    await lp.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
    await lp.submit.click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });

    // Drive the UI logout.
    await page.getByTestId(TEST_IDS.headerUserMenuTrigger).click();
    await page.getByTestId(TEST_IDS.headerUserMenuLogout).click();
    await page.waitForURL(/\/login/, { timeout: 10_000 });

    // Now ask the same browser context to refresh. The httpOnly refresh
    // cookie should have been revoked.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const r = await request.post('http://localhost:5173/api/v1/auth/refresh', {
      headers: { 'Content-Type': 'application/json', cookie: cookieHeader },
      data: {},
    });
    expect([401, 403]).toContain(r.status());
  });
});
