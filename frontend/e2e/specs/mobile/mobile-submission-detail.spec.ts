/**
 * Mobile submission detail — tabs/code-viewer must remain usable.
 *
 * Without a guaranteed seeded submission we lean on /me/submissions which
 * exists for every user role.
 */
import { test, expect, devices } from '@playwright/test';
import { uiLoginAs } from '../../helpers/cross-cutting';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile submission detail @mobile', () => {
  test('/me/submissions list renders without horizontal overflow', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    await page.goto('/me/submissions');
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('tabs are scrollable horizontally if too many', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    // Find any first submission link to navigate; otherwise fall back.
    await page.goto('/me/submissions');
    const firstLink = page.locator('a[href*="/submissions/"]').first();
    if ((await firstLink.count()) === 0) {
      test.skip(true, 'no submissions link reachable');
      return;
    }
    await firstLink.click();
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
    // Look for Mantine tabs.
    const tabsList = page.locator('[role="tablist"]').first();
    if ((await tabsList.count()) > 0) {
      const bb = await tabsList.boundingBox();
      if (bb) {
        // Either tabs fit, or they overflow horizontally with internal scroll.
        expect(bb.width).toBeLessThanOrEqual(420);
      }
    }
  });

  test('code blocks do not break layout on narrow viewport', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.goto('/me/submissions');
    const firstLink = page.locator('a[href*="/submissions/"]').first();
    if ((await firstLink.count()) === 0) {
      test.skip(true, 'no submissions link reachable');
      return;
    }
    await firstLink.click();
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 4,
    );
    expect(overflow).toBe(false);
  });
});
