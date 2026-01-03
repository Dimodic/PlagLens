/**
 * /admin/integrations/:id — Test connection / Sync now / sync history.
 */
import { test, expect } from '../../setup/fixtures';
import { IntegrationsListPo } from '../../pages/admin/IntegrationsPage.po';

test.describe('Integration detail — test / sync', () => {
  test.beforeEach(async ({ adminPage }) => {
    await adminPage.goto('/admin/integrations');
    await adminPage.waitForLoadState('domcontentloaded');
  });

  test('list page shows Test, Sync, and toggle buttons per row when integrations exist', async ({
    adminPage,
  }) => {
    const po = new IntegrationsListPo(adminPage);
    await po.goto();
    // Either there's an integration row or empty state.
    const hasRow = await adminPage.locator('[data-testid^="integration-row-"]').first().isVisible().catch(() => false);
    if (hasRow) {
      await expect(adminPage.getByRole('button', { name: /Тест/i }).first()).toBeVisible();
      await expect(adminPage.getByRole('button', { name: /Sync/ }).first()).toBeVisible();
    } else {
      await expect(adminPage.getByText(/Интеграций нет|Empty/i).first()).toBeVisible();
    }
  });

  test('test integration button is clickable on a row (best-effort)', async ({ adminPage }) => {
    const po = new IntegrationsListPo(adminPage);
    await po.goto();
    const testButton = adminPage.getByRole('button', { name: /Тест/i }).first();
    if (await testButton.isVisible().catch(() => false)) {
      await testButton.click();
      // Either success toast or error toast — both acceptable.
      await expect(adminPage.locator('.mantine-Notification-root, [role="alert"]').first()).toBeVisible({
        timeout: 15_000,
      });
    } else {
      test.skip();
    }
  });

  test('opening an integration shows the configuration tab and Sync history tab', async ({
    adminPage,
  }) => {
    const po = new IntegrationsListPo(adminPage);
    await po.goto();
    const openButton = adminPage.getByRole('link', { name: 'Открыть' }).first();
    if (await openButton.isVisible().catch(() => false)) {
      await openButton.click();
      await adminPage.waitForURL(/\/admin\/integrations\/[^/]+/, { timeout: 10_000 });
      await expect(adminPage.getByRole('tab', { name: 'Configuration' })).toBeVisible();
      await expect(adminPage.getByRole('tab', { name: 'Sync history' })).toBeVisible();
      await expect(adminPage.getByRole('tab', { name: 'Schedules' })).toBeVisible();
    } else {
      test.skip();
    }
  });
});
