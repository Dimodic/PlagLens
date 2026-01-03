/**
 * /admin/notifications/templates — list templates with edit modal preview.
 */
import { test, expect } from '../../setup/fixtures';
import { NotificationTemplatesPo } from '../../pages/admin/NotificationsPage.po';

test.describe('Admin notification templates', () => {
  test('admin opens templates page', async ({ adminPage }) => {
    const po = new NotificationTemplatesPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Шаблоны уведомлений').first()).toBeVisible();
  });

  test('event_type filter input exists and is interactive', async ({ adminPage }) => {
    const po = new NotificationTemplatesPo(adminPage);
    await po.goto();
    const ev = adminPage.getByPlaceholder(/event_type/i).first();
    await ev.fill('submission.graded');
    // Page must not crash.
    await expect(adminPage.getByText('Шаблоны уведомлений').first()).toBeVisible();
  });

  test('channel filter dropdown can be opened', async ({ adminPage }) => {
    const po = new NotificationTemplatesPo(adminPage);
    await po.goto();
    const channel = adminPage.getByPlaceholder('channel').first();
    await channel.click();
    await expect(adminPage.getByRole('option', { name: 'email' }).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('Edit button on first row opens modal preview', async ({ adminPage }) => {
    const po = new NotificationTemplatesPo(adminPage);
    await po.goto();
    const editButton = adminPage.getByRole('button', { name: 'Edit' }).first();
    if (await editButton.isVisible().catch(() => false)) {
      await editButton.click();
      // Modal title pattern: "Edit: <event_type> • <channel> • <locale>"
      await expect(adminPage.getByText(/^Edit:/).first()).toBeVisible({ timeout: 5_000 });
      // Body textarea
      await expect(adminPage.getByRole('textbox', { name: 'Body' })).toBeVisible();
    } else {
      test.skip();
    }
  });
});
