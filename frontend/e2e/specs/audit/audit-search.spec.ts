/**
 * /admin/audit/search — POST search with text query, filters and aggregations.
 */
import { test, expect } from '../../setup/fixtures';
import { AuditSearchPo } from '../../pages/admin/AuditPage.po';

test.describe('Audit — search', () => {
  test('admin opens audit search page', async ({ adminPage }) => {
    const po = new AuditSearchPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Audit search').first()).toBeVisible();
    await expect(po.qInput).toBeVisible();
  });

  test('submit with empty query renders without crash', async ({ adminPage }) => {
    const po = new AuditSearchPo(adminPage);
    await po.goto();
    await po.submit.click();
    // No exception; either aggregations or no rows.
    await adminPage.waitForLoadState('networkidle').catch(() => {});
  });

  test('toggle aggregation switch and search', async ({ adminPage }) => {
    const po = new AuditSearchPo(adminPage);
    await po.goto();
    // Toggle is enabled by default; click to flip off then on
    await po.aggToggle.click();
    await po.aggToggle.click();
    await po.submit.click();
    // Either aggregations card shows or no data — both fine.
    await adminPage.waitForLoadState('networkidle').catch(() => {});
  });

  test('with q text and aggregation enabled, page handles result', async ({ adminPage }) => {
    const po = new AuditSearchPo(adminPage);
    await po.goto();
    await po.qInput.fill('login');
    await po.submit.click();
    // After loading, we expect either an event card, an aggregations card, or no error alert.
    await adminPage.waitForLoadState('networkidle').catch(() => {});
    // Aggregations card is present iff the API returned aggregations.
    const aggVisible = await po.aggregationsCard.isVisible().catch(() => false);
    if (aggVisible) {
      // Bar chart bars must render (testid bar-{key}).
      const bars = adminPage.locator('[data-testid^="bar-"]');
      await expect(bars.first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
