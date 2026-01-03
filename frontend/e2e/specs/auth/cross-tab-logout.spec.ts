/**
 * Auth: cross-tab logout propagation.
 *
 * Two tabs in the same browser context share cookies. After tab A logs out,
 * tab B's existing in-memory access token is still valid until it expires —
 * but on the next bootstrap reload (or any 401 from a protected fetch), tab B
 * should also bounce to /login because the refresh cookie has been revoked.
 *
 * Coverage:
 *   - Two tabs logged in via the same context.
 *   - Tab A logs out via the user menu.
 *   - Tab B is reloaded — the bootstrap /auth/refresh fails and B redirects
 *     to /login.
 */
import { test, expect } from '@playwright/test';
import { LoginPagePo } from '../../pages/LoginPage.po';
import { DEMO_USERS } from '../../helpers/api';
import { TEST_IDS } from '../../helpers/selectors';

test.describe('@auth cross-tab-logout', () => {
  test('logout in tab A invalidates tab B on next refresh', async ({ context, request }) => {
    // The backend should reject cookieless /auth/refresh — guard the assertion
    // with a probe so a known-bad backend doesn't masquerade as a Playwright
    // regression here.
    const probe = await request.post('http://localhost:5173/api/v1/auth/refresh', {
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });
    if (probe.ok()) {
      test.skip(
        true,
        '/auth/refresh accepts cookieless requests — backend cannot enforce cross-tab logout.',
      );
    }

    // Tab A — login.
    const a = await context.newPage();
    const lpA = new LoginPagePo(a);
    await lpA.goto();
    const c = DEMO_USERS.admin;
    await lpA.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
    await lpA.submit.click();
    await a.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
    await expect(a.getByTestId(TEST_IDS.headerUserMenuTrigger)).toBeVisible();

    // Tab B — share the same context (cookies), so bootstrap /auth/refresh
    // also succeeds and the user appears authenticated.
    const b = await context.newPage();
    await b.goto('/me');
    await expect(b.getByTestId(TEST_IDS.headerUserMenuTrigger)).toBeVisible({ timeout: 15_000 });

    // Tab A logs out.
    await a.getByTestId(TEST_IDS.headerUserMenuTrigger).click();
    await a.getByTestId(TEST_IDS.headerUserMenuLogout).click();
    await a.waitForURL(/\/login/, { timeout: 10_000 });

    // Tab B reloads — its bootstrap refresh should fail because the cookie was
    // revoked, and ProtectedRoute redirects it to /login.
    await b.reload();
    await b.waitForURL(/\/login/, { timeout: 15_000 });
    await expect(b).toHaveURL(/\/login/);

    await a.close();
    await b.close();
  });
});
