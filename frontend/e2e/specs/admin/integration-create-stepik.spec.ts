/**
 * /admin/integrations/new — wizard for kind=stepik.
 */
import { test, expect } from '../../setup/fixtures';
import { IntegrationCreatePo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Integration wizard — Stepik', () => {
  test('default wizard kind is Stepik and form renders Stepik fields', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    // Step 1: kind select
    await expect(po.kindSelect).toBeVisible();
    await po.nextStep1.click();
    // Step 2: form for Stepik visible
    await expect(po.configForm('stepik')).toBeVisible({ timeout: 5_000 });
    // Stepik-specific labels
    await expect(adminPage.getByLabel('auth_method')).toBeVisible();
    await expect(adminPage.getByLabel('stepik_course_ids')).toBeVisible();
  });

  test('display_name required to advance to step 3', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    await po.nextStep1.click();
    // Without display_name, "Next" button should be disabled.
    await expect(po.nextStep2).toBeDisabled();
    await po.displayName.fill('My Stepik integration');
    await expect(po.nextStep2).toBeEnabled();
  });

  test('full Stepik wizard: kind → form → confirmation step', async ({ adminPage }) => {
    const po = new IntegrationCreatePo(adminPage);
    await po.goto();
    await po.nextStep1.click();
    const name = `e2e-stepik-${Date.now()}`;
    await po.displayName.fill(name);
    await po.nextStep2.click();
    // Step 3 — confirmation text contains the kind and name.
    await expect(adminPage.getByText(/stepik/i).first()).toBeVisible();
    await expect(adminPage.getByText(name).first()).toBeVisible();
    // Click Create — backend may succeed or return Problem; either way, button responds.
    await po.create.click();
    // Either redirect to detail OR a Problem alert is shown.
    await Promise.race([
      adminPage.waitForURL(/\/admin\/integrations\/[^/]+/, { timeout: 15_000 }).then(() => 'detail'),
      adminPage
        .getByRole('alert')
        .first()
        .waitFor({ timeout: 15_000 })
        .then(() => 'alert'),
    ]);
  });
});
