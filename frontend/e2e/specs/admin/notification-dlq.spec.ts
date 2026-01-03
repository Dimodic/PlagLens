/**
 * /admin/notifications/dlq — failed deliveries with retry/discard.
 */
import { test, expect } from '../../setup/fixtures';
import { NotificationDLQPo } from '../../pages/admin/NotificationsPage.po';

test.describe('Admin notifications DLQ', () => {
  test('admin opens DLQ page', async ({ adminPage }) => {
    const po = new NotificationDLQPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Notifications DLQ').first()).toBeVisible();
  });

  test('shows either rows with Retry/Discard or empty-state DLQ пуст', async ({ adminPage }) => {
    const po = new NotificationDLQPo(adminPage);
    await po.goto();
    const firstRow = adminPage.locator('[data-testid^="dlq-row-"]').first();
    const empty = adminPage.getByText(/DLQ пуст|empty/i);
    if (await firstRow.isVisible().catch(() => false)) {
      await expect(adminPage.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
      await expect(adminPage.getByRole('button', { name: 'Discard' }).first()).toBeVisible();
    } else {
      await expect(empty.first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
