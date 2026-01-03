/**
 * /admin/notifications/deliveries — recent delivery log.
 */
import { test, expect } from '../../setup/fixtures';
import { NotificationDeliveriesPo } from '../../pages/admin/NotificationsPage.po';

test.describe('Admin notification deliveries', () => {
  test('admin opens deliveries page', async ({ adminPage }) => {
    const po = new NotificationDeliveriesPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Доставки').first()).toBeVisible();
  });

  test('channel filter is interactive', async ({ adminPage }) => {
    const po = new NotificationDeliveriesPo(adminPage);
    await po.goto();
    const channel = adminPage.getByPlaceholder('channel').first();
    await channel.click();
    await expect(adminPage.getByRole('option', { name: 'email' }).first()).toBeVisible({
      timeout: 5_000,
    });
    await adminPage.getByRole('option', { name: 'email' }).first().click();
  });

  test('status filter is interactive', async ({ adminPage }) => {
    const po = new NotificationDeliveriesPo(adminPage);
    await po.goto();
    const status = adminPage.getByPlaceholder('status').first();
    await status.click();
    await expect(adminPage.getByRole('option', { name: 'failed' }).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('clicking a row opens the delivery details modal', async ({ adminPage }) => {
    const po = new NotificationDeliveriesPo(adminPage);
    await po.goto();
    const firstRow = adminPage.locator('[data-testid^="delivery-row-"]').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await expect(adminPage.getByText(/Детали доставки/i)).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip();
    }
  });
});
