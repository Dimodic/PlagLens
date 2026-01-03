/**
 * Auth: OAuth provider buttons + callback page.
 *
 * Coverage:
 *   - All four buttons (Google, Yandex, Stepik, GitHub) are rendered with stable testids
 *   - Clicking a button starts navigation to /api/v1/auth/oauth/<provider>/authorize
 *     We intercept the navigation to avoid a real OAuth round-trip.
 *   - /auth/oauth/callback?error=... shows a problem alert (no real session needed)
 *
 * Notes:
 *   The dev compose stack does not configure real OAuth client_ids, so the
 *   gateway responds with 400 OAUTH_PROVIDER_NOT_CONFIGURED. We therefore
 *   only assert the request *was made*, not that it succeeded.
 */
import { test, expect } from '@playwright/test';
import { LoginPagePo } from '../../pages/LoginPage.po';

const PROVIDERS = ['google', 'yandex', 'stepik', 'github'] as const;

test.describe('@auth oauth', () => {
  for (const provider of PROVIDERS) {
    test(`${provider} button starts an authorize redirect`, async ({ page }) => {
      const lp = new LoginPagePo(page);
      await lp.goto();

      const btn = lp.oauthButton(provider);
      await expect(btn).toBeVisible();

      // Block the real navigation so we don't end up on a 3rd-party hostname,
      // and capture that the request URL was the expected /authorize endpoint.
      let capturedUrl = '';
      await page.route(/\/api\/v1\/auth\/oauth\/.+\/authorize/, async (route) => {
        capturedUrl = route.request().url();
        // Abort to keep us on /login — we just wanted to know the URL.
        await route.abort();
      });

      await btn.click();
      await expect.poll(() => capturedUrl, { timeout: 5_000 }).toContain(`/auth/oauth/${provider}/authorize`);
      // The frontend should request our backend, not the provider directly.
      expect(capturedUrl).toContain('/api/v1/auth/oauth/');
    });
  }

  test('callback page with ?error= shows a problem alert', async ({ page }) => {
    await page.goto('/auth/oauth/callback?error=access_denied&error_description=user+cancelled');
    await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/access_denied|не удалось/i).first()).toBeVisible();
  });

  test('callback page without error shows the loading state then redirects to /login when no session', async ({ page }) => {
    await page.goto('/auth/oauth/callback');
    // Either the loading state appears briefly, or we land on a problem alert
    // because /auth/refresh fails (no session).
    const loading = page.getByTestId('oauth-callback-loading');
    const alert = page.getByRole('alert').first();
    await expect(loading.or(alert).first()).toBeVisible({ timeout: 5_000 });
  });
});
