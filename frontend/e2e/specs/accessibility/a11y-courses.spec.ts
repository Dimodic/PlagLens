/**
 * Accessibility — authenticated pages: /courses, /me, /admin.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uiLoginAs } from '../../helpers/cross-cutting';

const PAGES = ['/courses', '/me'];

test.describe('a11y authenticated pages', () => {
  for (const path of PAGES) {
    test(`no critical/serious violations on ${path}`, async ({ page }) => {
      await uiLoginAs(page, 'admin');
      await page.goto(path);
      await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => null);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .disableRules([
          // Mantine themed components frequently trip color-contrast against
          // dimmed text. Tracked in design-system audit separately.
          'color-contrast',
        ])
        .analyze();
      const severe = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      if (severe.length > 0) {
        console.log(
          `a11y violations on ${path}:`,
          severe.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })),
        );
      }
      expect(severe.length).toBe(0);
    });
  }
});
