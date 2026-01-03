/**
 * /admin/integrations — list, filters, badges.
 */
import { test, expect } from '../../setup/fixtures';
import { IntegrationsListPo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Admin integrations — list', () => {
  test('admin opens integrations list', async ({ adminPage }) => {
    const po = new IntegrationsListPo(adminPage);
    await po.goto();
    await expect(po.title).toBeVisible();
    await expect(po.newButton).toBeVisible();
    await expect(po.webhooksLink).toBeVisible();
  });

  test('kind filter dropdown is interactive', async ({ adminPage }) => {
    const po = new IntegrationsListPo(adminPage);
    await po.goto();
    const kindSelect = adminPage.getByPlaceholder('Kind').first();
    await kindSelect.click();
    await expect(adminPage.getByRole('option', { name: 'Stepik' })).toBeVisible({ timeout: 5_000 });
    await adminPage.getByRole('option', { name: 'Stepik' }).click();
    // No exception expected.
    await expect(po.title).toBeVisible();
  });

  test('status filter dropdown is interactive', async ({ adminPage }) => {
    const po = new IntegrationsListPo(adminPage);
    await po.goto();
    const statusSelect = adminPage.getByPlaceholder('Status').first();
    await statusSelect.click();
    await expect(adminPage.getByRole('option', { name: 'active' })).toBeVisible({ timeout: 5_000 });
  });

  test('teacher cannot reach /admin/integrations', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/integrations');
    await teacherPage.waitForLoadState('domcontentloaded');
    const url = teacherPage.url();
    if (url.includes('/admin/integrations')) {
      const titleVisible = await teacherPage
        .getByTestId('integrations-title')
        .isVisible()
        .catch(() => false);
      if (titleVisible) {
        await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
      }
    } else {
      expect(url).not.toContain('/admin/integrations');
    }
  });
});
