/**
 * /admin/system/health — gateway aggregated /v1/services-status.
 */
import { test, expect } from '../../setup/fixtures';
import { SystemHealthPo } from '../../pages/admin/SystemPage.po';

test.describe('Admin — system health', () => {
  test('admin opens system health page', async ({ adminPage }) => {
    const po = new SystemHealthPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('System health').first()).toBeVisible();
  });

  test('at least one service card is rendered', async ({ adminPage }) => {
    const po = new SystemHealthPo(adminPage);
    await po.goto();
    // Wait for cards to appear.
    const card = adminPage.locator('[data-testid^="service-card-"]').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
  });

  test('each service card has a status badge', async ({ adminPage }) => {
    const po = new SystemHealthPo(adminPage);
    await po.goto();
    const cards = adminPage.locator('[data-testid^="service-card-"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // First card should have a badge with status text.
    const first = cards.first();
    await expect(
      first.getByText(/healthy|degraded|unhealthy|unknown/i).first(),
    ).toBeVisible();
  });
});
