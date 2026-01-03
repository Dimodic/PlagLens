/**
 * Accessibility — /login page.
 *
 * We use @axe-core/playwright to look for serious / critical violations.
 * We allowlist a few well-known false positives in third-party widgets
 * (e.g. Mantine wraps).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('a11y /login', () => {
  test('no critical/serious violations', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // Disable a couple of rules that are known to false-positive against
      // Mantine's themed components in dev (verified manually in the design
      // system audit).
      .disableRules([
        'region', // page-level region is provided by AppShell, not /login.
        'color-contrast', // Mantine variant="light" alerts vs theme — design-system tracked separately.
      ])
      .analyze();
    const severe = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    if (severe.length > 0) {
      console.log(
        'a11y violations on /login:',
        severe.map((v) => ({ id: v.id, nodes: v.nodes.length, help: v.help })),
      );
    }
    expect(severe.length).toBe(0);
  });

  test('login form fields have accessible names', async ({ page }) => {
    await page.goto('/login');
    // Each input should have an associated label/aria-label.
    const inputs = page.locator('input[type="email"], input[type="password"], input[type="text"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const accName = await input.evaluate((el: HTMLInputElement) => {
        // Crude accessible-name approximation.
        if (el.getAttribute('aria-label')) return el.getAttribute('aria-label');
        if (el.getAttribute('placeholder')) return el.getAttribute('placeholder');
        const id = el.id;
        if (id) {
          const label = document.querySelector(`label[for="${id}"]`);
          if (label) return label.textContent;
        }
        return el.closest('label')?.textContent ?? '';
      });
      expect((accName ?? '').toString().trim().length).toBeGreaterThan(0);
    }
  });
});
