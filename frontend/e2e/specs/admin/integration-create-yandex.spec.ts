/**
 * /admin/integrations/new — wizard for kind=yandex_contest.
 */
import { test, expect } from '../../setup/fixtures';
import { IntegrationCreatePo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Integration wizard — Yandex.Contest', () => {
  test('selecting Yandex.Contest renders that form', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    // Open kind select and pick yandex.
    await po.kindSelect.click();
    await adminPage.getByRole('option', { name: 'Yandex.Contest' }).click();
    await po.nextStep1.click();
    await expect(po.configForm('yandex_contest')).toBeVisible({ timeout: 5_000 });
    await expect(adminPage.getByLabel(/oauth_token/i)).toBeVisible();
    await expect(adminPage.getByLabel('contest_ids')).toBeVisible();
  });

  test('Yandex form: oauth_token field accepts input', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    await po.kindSelect.click();
    await adminPage.getByRole('option', { name: 'Yandex.Contest' }).click();
    await po.nextStep1.click();

    await po.displayName.fill(`e2e-yandex-${Date.now()}`);
    const tokenField = adminPage.getByLabel(/oauth_token/i);
    await tokenField.fill('YA_OAUTH_FAKE_TOKEN');
    await expect(po.nextStep2).toBeEnabled();
  });

  test('Yandex form has no Stepik-specific fields', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    await po.kindSelect.click();
    await adminPage.getByRole('option', { name: 'Yandex.Contest' }).click();
    await po.nextStep1.click();
    await expect(po.configForm('yandex_contest')).toBeVisible();
    await expect(adminPage.getByLabel('stepik_course_ids')).toHaveCount(0);
  });
});
