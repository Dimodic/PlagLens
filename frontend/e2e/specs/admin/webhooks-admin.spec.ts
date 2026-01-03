/**
 * /admin/integrations/webhooks — incoming webhook events log.
 */
import { test, expect } from '../../setup/fixtures';
import { WebhooksAdminPo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Admin webhooks — events log', () => {
  test('admin sees title and kind filter dropdown', async ({ adminPage }) => {
    const po = new WebhooksAdminPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Webhook events').first()).toBeVisible();
    await expect(adminPage.getByPlaceholder('Kind').first()).toBeVisible();
  });

  test('kind filter accepts a value', async ({ adminPage }) => {
    const po = new WebhooksAdminPo(adminPage);
    await po.goto();
    const kindSelect = adminPage.getByPlaceholder('Kind').first();
    await kindSelect.click();
    await adminPage.getByRole('option', { name: 'stepik' }).first().click();
    // Page does not crash; either rows or empty state.
    await expect(
      adminPage.getByText(/События не приходили|Kind|Подпись/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('empty state or rows render correctly', async ({ adminPage }) => {
    const po = new WebhooksAdminPo(adminPage);
    await po.goto();
    const emptyOrRow = adminPage.getByText(/События не приходили|valid|invalid/i).first();
    await expect(emptyOrRow).toBeVisible({ timeout: 10_000 });
  });
});
