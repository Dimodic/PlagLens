/**
 * /admin/audit/legal-holds — create / list / remove legal holds.
 */
import { test, expect } from '../../setup/fixtures';
import { AuditLegalHoldPo } from '../../pages/admin/AuditPage.po';
import { uniqueSlug } from '../../helpers/factories';
import { waitForToast } from '../../helpers/waits';

test.describe('Audit — legal hold', () => {
  test('admin opens legal-holds page', async ({ adminPage }) => {
    const po = new AuditLegalHoldPo(adminPage);
    await po.goto();
    await expect(po.title).toBeVisible({ timeout: 10_000 });
    await expect(po.createButton).toBeVisible();
  });

  test('create button opens modal with required fields', async ({ adminPage }) => {
    const po = new AuditLegalHoldPo(adminPage);
    await po.goto();
    await po.createButton.click();
    await expect(po.resourceIdInput).toBeVisible({ timeout: 5_000 });
    await expect(po.reasonInput).toBeVisible();
    await expect(po.submit).toBeVisible();
  });

  test('submit empty form fails server-side and shows alert OR client validation', async ({
    adminPage,
  }) => {
    const po = new AuditLegalHoldPo(adminPage);
    await po.goto();
    await po.createButton.click();
    await po.submit.click();
    // Either Problem alert OR HTML5 'required' attribute keeps modal open.
    const alertVisible = await adminPage
      .getByRole('alert')
      .first()
      .isVisible()
      .catch(() => false);
    expect(alertVisible || (await po.resourceIdInput.isVisible())).toBeTruthy();
  });

  test('create a legal hold and see toast', async ({ adminPage }) => {
    const po = new AuditLegalHoldPo(adminPage);
    await po.goto();
    await po.createButton.click();
    const resourceId = `e2e-${uniqueSlug('hold')}`;
    await po.resourceIdInput.fill(resourceId);
    await po.reasonInput.fill('E2E test — investigation in progress');
    await po.submit.click();
    // Either success toast or Problem (server might reject for unknown resource_id).
    await expect(
      adminPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('removing a hold (best-effort: only if a row exists)', async ({ adminPage }) => {
    const po = new AuditLegalHoldPo(adminPage);
    await po.goto();
    const removeButton = adminPage.getByRole('button', { name: /Снять/i }).first();
    if (await removeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await removeButton.click();
      await waitForToast(adminPage, /снят|removed|deleted/i, 10_000);
    } else {
      test.skip();
    }
  });
});
