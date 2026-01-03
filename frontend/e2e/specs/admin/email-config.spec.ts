/**
 * /admin/notifications/email — email transport configuration.
 */
import { test, expect } from '../../setup/fixtures';
import { EmailConfigPo } from '../../pages/admin/NotificationsPage.po';

test.describe('Admin email config', () => {
  test('admin opens email config page', async ({ adminPage }) => {
    const po = new EmailConfigPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Email-конфиг').first()).toBeVisible();
    await expect(po.transport).toBeVisible({ timeout: 10_000 });
  });

  test('switch transport from smtp to mailgun reveals mailgun fields', async ({ adminPage }) => {
    const po = new EmailConfigPo(adminPage);
    await po.goto();
    await expect(po.fromEmail).toBeVisible({ timeout: 10_000 });
    await po.transport.click();
    await adminPage.getByRole('option', { name: 'Mailgun' }).click();
    await expect(adminPage.getByLabel('mailgun_domain')).toBeVisible({ timeout: 5_000 });
  });

  test('test email button fires API and shows toast', async ({ adminPage }) => {
    const po = new EmailConfigPo(adminPage);
    await po.goto();
    await expect(po.testButton).toBeVisible({ timeout: 10_000 });
    await po.testButton.click();
    await expect(
      adminPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('save button is visible and clickable', async ({ adminPage }) => {
    const po = new EmailConfigPo(adminPage);
    await po.goto();
    await expect(po.saveButton).toBeVisible({ timeout: 10_000 });
    await expect(po.saveButton).toBeEnabled();
  });
});
