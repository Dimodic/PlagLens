/**
 * /admin/system/settings — read-only system info: version, build, uptime.
 */
import { test, expect } from '../../setup/fixtures';
import { SystemSettingsPo } from '../../pages/admin/SystemPage.po';

test.describe('Admin — system settings/info', () => {
  test('admin opens system info page', async ({ adminPage }) => {
    const po = new SystemSettingsPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('System info').first()).toBeVisible();
  });

  test('version, build, uptime rows are present', async ({ adminPage }) => {
    const po = new SystemSettingsPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Version').first()).toBeVisible({ timeout: 10_000 });
    await expect(adminPage.getByText('Build').first()).toBeVisible();
    await expect(adminPage.getByText('Uptime').first()).toBeVisible();
  });

  test('health checks link points to /admin/system/health', async ({ adminPage }) => {
    const po = new SystemSettingsPo(adminPage);
    await po.goto();
    const healthLink = adminPage.getByRole('link', { name: /services-status/ });
    await expect(healthLink).toBeVisible({ timeout: 5_000 });
    await healthLink.click();
    await adminPage.waitForURL(/\/admin\/system\/health/, { timeout: 10_000 });
  });
});
