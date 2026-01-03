/**
 * /admin/tenants/new — super_admin creates a tenant.
 */
import { test, expect } from '../../setup/fixtures';
import { TenantCreatePo, TenantsListPo, TenantDetailPo } from '../../pages/admin/TenantsPage.po';
import { uiLoginAs } from '../../helpers/auth';
import { uniqueSlug } from '../../helpers/factories';
import { waitForToast } from '../../helpers/waits';

test.describe('Admin tenants — create / suspend / activate', () => {
  test('super_admin creates a new tenant and lands on detail page', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'super_admin');
      const slug = uniqueSlug('e2e-tenant');
      const create = new TenantCreatePo(page);
      await create.goto();
      await create.fillAndSubmit({ slug, name: `E2E ${slug}` });
      // After create we should be at /admin/tenants/:id and see the title.
      await page.waitForURL(/\/admin\/tenants\/[^/]+/, { timeout: 15_000 });
      const detail = new TenantDetailPo(page);
      await expect(detail.title).toContainText(`E2E ${slug}`);
      await expect(detail.statusBadge).toContainText(/active|pending/i);
    } finally {
      await ctx.close();
    }
  });

  test('slug conflict shows a Problem alert and does not navigate away', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'super_admin');
      const slug = uniqueSlug('e2e-conflict');
      const create = new TenantCreatePo(page);

      await create.goto();
      await create.fillAndSubmit({ slug, name: `Conflict ${slug}` });
      await page.waitForURL(/\/admin\/tenants\/[^/]+/, { timeout: 15_000 });

      // Try creating again with the same slug.
      await create.goto();
      await create.fillAndSubmit({ slug, name: `Conflict B ${slug}` });
      // Stays on /admin/tenants/new and shows Problem.
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
      expect(page.url()).toContain('/admin/tenants/new');
    } finally {
      await ctx.close();
    }
  });

  test('suspend then activate toggles button label and badge', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'super_admin');
      const slug = uniqueSlug('e2e-toggle');
      const create = new TenantCreatePo(page);
      await create.goto();
      await create.fillAndSubmit({ slug, name: `Toggle ${slug}` });
      await page.waitForURL(/\/admin\/tenants\/[^/]+/, { timeout: 15_000 });

      const detail = new TenantDetailPo(page);
      // Initially should be "active": Suspend button visible.
      await expect(detail.suspendButton).toBeVisible({ timeout: 10_000 });
      await detail.suspendButton.click();
      await waitForToast(page, /приостановлен|suspended|saved/i, 10_000);
      await expect(detail.activateButton).toBeVisible({ timeout: 10_000 });

      await detail.activateButton.click();
      await waitForToast(page, /активирован|activated/i, 10_000);
      await expect(detail.suspendButton).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('after create, tenant appears on the list page', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'super_admin');
      const slug = uniqueSlug('e2e-listed');
      const create = new TenantCreatePo(page);
      await create.goto();
      await create.fillAndSubmit({ slug, name: `Listed ${slug}` });
      await page.waitForURL(/\/admin\/tenants\/[^/]+/, { timeout: 15_000 });

      const list = new TenantsListPo(page);
      await list.goto();
      await expect(list.row(slug)).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });
});
