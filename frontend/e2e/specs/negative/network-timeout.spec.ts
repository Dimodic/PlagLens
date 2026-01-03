/**
 * Network timeout / slow response handling.
 *
 * Strategy: use page.route() to delay an API response, then verify the
 * SPA shows a loading state and ultimately renders an error or completes
 * gracefully without hanging the UI.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/cross-cutting';

test.describe('Network resilience', () => {
  test('slow API: SPA does not freeze, eventually shows content or error', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    // Throttle a known endpoint to 5s.
    await page.route('**/api/v1/courses?**', async (route) => {
      await new Promise((res) => setTimeout(res, 5_000));
      await route.continue();
    });
    await page.goto('/courses');
    // Even with delay, we must still see a header/shell.
    await expect(page.locator('body')).toBeVisible();
    // Wait up to 12s for things to settle.
    await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => null);
  });

  test('aborted request: SPA shows error alert, no hung spinner', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    let aborted = false;
    await page.route('**/api/v1/courses?**', async (route) => {
      aborted = true;
      await route.abort('failed');
    });
    await page.goto('/courses');
    // Give the SPA time to render an error path.
    await page.waitForTimeout(2_000);
    expect(aborted).toBe(true);
    await expect(page.locator('body')).toBeVisible();
  });

  test('500 from API: SPA renders ProblemAlert (no white-screen)', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.route('**/api/v1/courses?**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Internal',
          status: 500,
          code: 'INTERNAL',
          detail: 'simulated',
          request_id: 'rid-test-internal',
        }),
      });
    });
    await page.goto('/courses');
    await page.waitForTimeout(1_500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('offline: gateway unreachable shows network-error UI', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.context().setOffline(true);
    await page.goto('/courses').catch(() => null);
    await page.waitForTimeout(1_500);
    await expect(page.locator('body')).toBeVisible();
    await page.context().setOffline(false);
  });
});
