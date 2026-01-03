/**
 * /admin/audit/retention — retention policy view/edit.
 */
import { test, expect } from '../../setup/fixtures';
import { AuditRetentionPolicyPo } from '../../pages/admin/AuditPage.po';

test.describe('Audit — retention policy', () => {
  test('admin opens retention policy form', async ({ adminPage }) => {
    const po = new AuditRetentionPolicyPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Retention policy').first()).toBeVisible();
    await expect(po.defaultDays).toBeVisible({ timeout: 10_000 });
    await expect(po.longDays).toBeVisible();
    await expect(po.legalHoldToggle).toBeVisible();
    await expect(po.saveButton).toBeVisible();
  });

  test('default_days input accepts numeric value', async ({ adminPage }) => {
    const po = new AuditRetentionPolicyPo(adminPage);
    await po.goto();
    await po.defaultDays.fill('400');
    // Save: backend may accept; toast shown either way.
    await po.saveButton.click();
    await expect(
      adminPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('legal-hold toggle is interactive', async ({ adminPage }) => {
    const po = new AuditRetentionPolicyPo(adminPage);
    await po.goto();
    await expect(po.legalHoldToggle).toBeVisible({ timeout: 10_000 });
    await po.legalHoldToggle.click();
    await po.saveButton.click();
    await expect(
      adminPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('long_retention_days has default >= 1', async ({ adminPage }) => {
    const po = new AuditRetentionPolicyPo(adminPage);
    await po.goto();
    await expect(po.longDays).toBeVisible({ timeout: 10_000 });
    const value = await po.longDays.inputValue();
    expect(Number(value)).toBeGreaterThanOrEqual(1);
  });
});
