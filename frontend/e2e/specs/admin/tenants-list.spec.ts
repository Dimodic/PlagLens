/**
 * /admin/tenants — list of tenants. admin sees all; non-admin restricted.
 */
import { test, expect } from '../../setup/fixtures';
import { TenantsListPo } from '../../pages/admin/TenantsPage.po';
import { uiLoginAs } from '../../helpers/auth';
import { DEMO_TENANT_SLUG } from '../../helpers/api';

test.describe('Admin tenants — list', () => {
  test('admin can open /admin/tenants and see at least one row', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'admin');
      const po = new TenantsListPo(page);
      await po.goto();
      await expect(po.title).toBeVisible();
      // The system seed must include at least the demo tenant.
      await expect(po.row(DEMO_TENANT_SLUG)).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('admin sees New tenant button', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'admin');
      const po = new TenantsListPo(page);
      await po.goto();
      await expect(po.newButton).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('teacher cannot reach /admin/tenants', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/tenants');
    await teacherPage.waitForLoadState('domcontentloaded');
    // Teachers should not see admin nav. Verify either redirect or RBAC error.
    const url = teacherPage.url();
    if (url.includes('/admin/tenants')) {
      // Page may render but rows query returns 403 -> Problem alert.
      const tenantsTitle = teacherPage.getByTestId('tenants-title');
      const problem = teacherPage.getByRole('alert').filter({ hasText: /403|forbidden|нет доступа/i });
      // One of: title not visible OR error alert.
      const titleVisible = await tenantsTitle.isVisible().catch(() => false);
      if (titleVisible) {
        await expect(problem.first()).toBeVisible({ timeout: 10_000 });
      }
    } else {
      expect(url).not.toContain('/admin/tenants');
    }
  });
});
