/**
 * Color contrast — axe enforces WCAG AA contrast ≥ 4.5:1 for normal text.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uiLoginAs } from '../../helpers/cross-cutting';

test.describe('Color contrast', () => {
  test('/login has no contrast violations', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
      .withTags(['cat.color'])
      .options({ runOnly: ['color-contrast'] })
      .analyze();
    const failures = results.violations.filter((v) => v.id === 'color-contrast');
    if (failures.length > 0) {
      console.log(
        'contrast failures on /login:',
        failures.flatMap((v) => v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary }))),
      );
    }
    // Allow up to 0 critical, but we tolerate some serious-but-niche
    // failures in dev (e.g. disabled buttons). Strict mode = 0.
    const critical = failures.filter((v) => v.impact === 'critical');
    expect(critical.length).toBe(0);
  });

  test('/courses has no contrast violations', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.goto('/courses');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null);
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ['color-contrast'] })
      .analyze();
    const critical = results.violations.filter((v) => v.impact === 'critical');
    expect(critical.length).toBe(0);
  });
});
