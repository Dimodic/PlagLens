/**
 * /admin/audit/resources/:type/:id — events by resource id.
 */
import { test, expect } from '../../setup/fixtures';
import { AuditByResourcePo } from '../../pages/admin/AuditPage.po';

test.describe('Audit — by resource', () => {
  test('renders for an arbitrary resource type/id', async ({ adminPage }) => {
    const po = new AuditByResourcePo(adminPage);
    await po.gotoForResource('submission', '00000000-0000-0000-0000-000000000000');
    await expect(adminPage.getByText('Audit • Resource').first()).toBeVisible();
    await expect(
      adminPage.getByText('submission/00000000-0000-0000-0000-000000000000').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('renders for a tenant resource', async ({ adminPage }) => {
    const po = new AuditByResourcePo(adminPage);
    await po.gotoForResource('tenant', 'demo-tenant-id');
    await expect(adminPage.getByText('Audit • Resource').first()).toBeVisible();
    await expect(adminPage.getByText('tenant/demo-tenant-id').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
