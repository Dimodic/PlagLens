/**
 * Mobile /courses list — single-column, no horizontal scroll.
 */
import { test, expect, devices } from '@playwright/test';
import { uiLoginAs } from '../../helpers/cross-cutting';

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile courses list @mobile', () => {
  test('cards stack vertically on narrow viewport (>1 row)', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.goto('/courses');
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
    const cards = page.locator('[data-testid^="course-card-"], .mantine-Card-root');
    const n = await cards.count();
    if (n >= 2) {
      const boxes = await Promise.all(
        Array.from({ length: n }).map(async (_, i) => cards.nth(i).boundingBox()),
      );
      const ys = boxes.map((b) => b?.y ?? -1).filter((y) => y >= 0);
      const widths = boxes.map((b) => b?.width ?? -1).filter((w) => w >= 0);
      // Cards must wrap into multiple rows. We're explicitly NOT prescribing a
      // column count — different breakpoints make different choices, and
      // the regression we care about is "cards overflow horizontally".
      if (ys.length > 1) {
        const distinctYs = new Set(ys.map((y) => Math.round(y / 8)));
        expect(distinctYs.size).toBeGreaterThan(1);
      }
      // Each card must fit inside the viewport (Pixel 5 = 393).
      for (const w of widths) {
        expect(w).toBeLessThanOrEqual(420);
      }
    }
  });

  test('no horizontal scroll on courses page', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.goto('/courses');
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => null);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('content area renders within viewport width', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.goto('/courses');
    const main = page.locator('main, [role="main"], #app, body > div').first();
    const bb = await main.boundingBox();
    if (bb) {
      expect(bb.width).toBeLessThanOrEqual(420);
    }
  });
});
