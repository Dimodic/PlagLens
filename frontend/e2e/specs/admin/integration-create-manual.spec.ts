/**
 * /admin/integrations/new — wizard for kind=manual.
 */
import { test, expect } from '../../setup/fixtures';
import { IntegrationCreatePo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Integration wizard — Manual upload', () => {
  test('Manual form renders the allow_zip_upload switch', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    await po.kindSelect.click();
    await adminPage.getByRole('option', { name: /Manual/i }).click();
    await po.nextStep1.click();

    await expect(po.configForm('manual')).toBeVisible({ timeout: 5_000 });
    await expect(adminPage.getByText(/Разрешить bulk-upload/i)).toBeVisible();
  });

  test('Manual flow: complete to confirmation step', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    await po.kindSelect.click();
    await adminPage.getByRole('option', { name: /Manual/i }).click();
    await po.nextStep1.click();
    const name = `e2e-manual-${Date.now()}`;
    await po.displayName.fill(name);
    await po.nextStep2.click();
    await expect(adminPage.getByText(/manual/i).first()).toBeVisible();
    await expect(adminPage.getByText(name).first()).toBeVisible();
  });
});
