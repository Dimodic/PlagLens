/**
 * /admin/integrations/webhooks — incoming webhook events log.
 */
import { test, expect } from '../../setup/fixtures';
import { WebhooksAdminPo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Admin webhooks — events log', () => {
  test('admin sees title and kind filter dropdown', async ({ adminPage }) => {
    const po = new WebhooksAdminPo(adminPage);
    await po.goto();
    // Title was localised to Russian as part of the admin-UI sweep.
    await expect(adminPage.getByText('События webhook').first()).toBeVisible();
    // Old `getByPlaceholder('Kind')` was already broken (Select had a value
    // set at all times, so the placeholder never showed). Use the testid
    // the page now exports.
    await expect(adminPage.getByTestId('webhooks-kind-filter')).toBeVisible();
  });

  test('kind filter accepts a value', async ({ adminPage }) => {
    const po = new WebhooksAdminPo(adminPage);
    await po.goto();
    const kindSelect = adminPage.getByTestId('webhooks-kind-filter');
    await kindSelect.click();
    await adminPage.getByRole('option', { name: 'Stepik' }).first().click();
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
