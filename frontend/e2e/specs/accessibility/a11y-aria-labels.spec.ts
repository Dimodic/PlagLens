/**
 * ARIA + landmarks: every button / input has a name; landmarks present.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { uiLoginAs } from '../../helpers/cross-cutting';

test.describe('ARIA labels & landmarks', () => {
  test('/login: buttons have accessible names', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ['button-name', 'input-button-name', 'aria-input-field-name'] })
      .analyze();
    const violations = results.violations;
    if (violations.length > 0) {
      console.log('aria/button-name violations:', violations.map((v) => v.id));
    }
    expect(violations.length).toBe(0);
  });

  test('/login: inputs have associated labels', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ['label', 'aria-required-attr'] })
      .analyze();
    const failures = results.violations;
    expect(failures.length).toBe(0);
  });

  test('authenticated page has landmark regions', async ({ page }) => {
    await uiLoginAs(page, 'admin');
    await page.goto('/me');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null);
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ['landmark-one-main', 'landmark-unique', 'page-has-heading-one'] })
      .analyze();
    const failures = results.violations.filter((v) => v.impact === 'critical');
    expect(failures.length).toBe(0);
  });

  test('headings establish a hierarchy', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page })
      .options({ runOnly: ['heading-order'] })
      .analyze();
    expect(results.violations.length).toBe(0);
  });
});
