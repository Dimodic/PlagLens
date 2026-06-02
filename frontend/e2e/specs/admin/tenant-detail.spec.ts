/**
 * /admin/tenants/:id — tabs Settings/Users/Usage/Audit + CORS edit.
 */
import { test, expect } from '../../setup/fixtures';
import { TenantsListPo, TenantDetailPo } from '../../pages/admin/TenantsPage.po';
import { uiLoginAs } from '../../helpers/auth';
import { DEMO_TENANT_SLUG } from '../../helpers/api';
import { waitForToast } from '../../helpers/waits';

async function findDemoTenantId(page: import('@playwright/test').Page): Promise<string> {
  const list = new TenantsListPo(page);
  await list.goto();
  await expect(list.row(DEMO_TENANT_SLUG)).toBeVisible({ timeout: 10_000 });
  // Click "Open" to navigate; capture ID from URL.
  await list.openButton(DEMO_TENANT_SLUG).click();
  await page.waitForURL(/\/admin\/tenants\/[^/]+/, { timeout: 10_000 });
  const m = page.url().match(/\/admin\/tenants\/([^/?#]+)/);
  if (!m) throw new Error('could not parse tenant id');
  return m[1];
}

test.describe('Admin tenants — detail tabs', () => {
  test('all four tabs render content for the demo tenant', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'admin');
      await findDemoTenantId(page);
      const detail = new TenantDetailPo(page);
      await detail.tabSettings.click();
      await expect(detail.corsInput).toBeVisible({ timeout: 10_000 });

      await detail.tabUsers.click();
      await expect(page.getByRole('button', { name: /открыть пользователей/i })).toBeVisible();

      await detail.tabUsage.click();
      // usage tab shows numeric cards or "Нет данных"
      await expect(page.getByText(/Пользователей всего|Нет данных/i)).toBeVisible({ timeout: 10_000 });

      await detail.tabAudit.click();
      await expect(page.getByRole('link', { name: /открыть аудит/i })).toBeVisible({ timeout: 10_000 });
    } finally {
      await ctx.close();
    }
  });

  test('CORS origins are editable and saved', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'admin');
      await findDemoTenantId(page);
      const detail = new TenantDetailPo(page);
      await expect(detail.corsInput).toBeVisible({ timeout: 10_000 });
      // Add a unique origin tag — click input then type and press Enter.
      const newOrigin = `https://e2e-${Date.now()}.example.com`;
      await detail.corsInput.click();
      await page.keyboard.type(newOrigin);
      await page.keyboard.press('Enter');
      await detail.saveButton.click();
      await waitForToast(page, /сохранено|saved/i, 10_000);
    } finally {
      await ctx.close();
    }
  });

  test('default_ai_provider field is editable', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await uiLoginAs(page, 'admin');
      await findDemoTenantId(page);
      const detail = new TenantDetailPo(page);
      await detail.tabSettings.click();
      await detail.defaultProviderInput.fill('openai');
      await detail.saveButton.click();
      await waitForToast(page, /сохранено|saved/i, 10_000);
    } finally {
      await ctx.close();
    }
  });
});
