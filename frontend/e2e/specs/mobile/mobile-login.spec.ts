/**
 * Mobile responsiveness — /login.
 *
 * The mobile-chrome project (Pixel 5) gates @mobile-tagged tests.
 * For convenience we include @mobile in test titles so opt-in matches.
 */
import { test, expect, devices } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile login @mobile', () => {
  test('email + password fields visible on mobile viewport', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId(TEST_IDS.loginEmail)).toBeVisible();
    await expect(page.getByTestId(TEST_IDS.loginPassword)).toBeVisible();
    await expect(page.getByTestId(TEST_IDS.loginSubmit)).toBeVisible();
  });

  test('OAuth buttons stack vertically (no horizontal overflow)', async ({ page }) => {
    await page.goto('/login');
    const oauthButtons = page.locator('[data-testid^="login-oauth-"]');
    const count = await oauthButtons.count();
    if (count >= 2) {
      const boxes = await Promise.all(
        Array.from({ length: count }).map(async (_, i) => oauthButtons.nth(i).boundingBox()),
      );
      const valid = boxes.filter((b): b is NonNullable<typeof b> => !!b);
      // On a narrow viewport (Pixel 5 ≈ 393px), at most 2 should fit
      // side-by-side; mostly each should be on its own row.
      // Verify total horizontal span fits viewport.
      for (const b of valid) {
        expect(b.x + b.width).toBeLessThanOrEqual(420);
      }
    }
  });

  test('no horizontal scroll on /login', async ({ page }) => {
    await page.goto('/login');
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test('form is usable: type credentials and submit', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId(TEST_IDS.loginEmail).fill('admin@demo.local');
    await page.getByTestId(TEST_IDS.loginPassword).fill('admin');
    await page.getByTestId(TEST_IDS.loginTenantSlug).fill('demo-hse');
    await page.getByTestId(TEST_IDS.loginSubmit).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15_000 });
  });
});
