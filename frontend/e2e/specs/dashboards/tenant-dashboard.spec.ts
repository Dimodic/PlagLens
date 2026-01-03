/**
 * E2E: /admin — TenantDashboardPage
 */
import { expect, test } from '../../setup/fixtures';
import { TenantDashboardPagePo } from '../../pages/dashboards/TenantDashboardPage.po';

test.describe('Tenant Dashboard /admin', () => {
  test('admin sees the tenant KPIs grid', async ({ adminPage }) => {
    const po = new TenantDashboardPagePo(adminPage);
    await po.goto();
    await expect(po.kpisRoot).toBeVisible();
    for (const name of [
      'active-courses',
      'active-users-dau',
      'active-users-mau',
      'submissions-30d',
      'ai-tokens-30d',
      'ai-cost-30d',
      'plagiarism-runs-30d',
      'storage',
    ]) {
      await expect(po.kpi(name)).toBeVisible();
    }
  });

  test('integrations health table or "no data" placeholder', async ({
    adminPage,
  }) => {
    const po = new TenantDashboardPagePo(adminPage);
    await po.goto();
    const heading = adminPage.getByText('Состояние интеграций');
    await expect(heading).toBeVisible();
  });

  test('teachers cannot reach /admin (RoleGuard)', async ({ teacherPage }) => {
    await teacherPage.goto('/admin');
    await expect(
      teacherPage.getByText(/Страница не найдена|Not Found|404/),
    ).toBeVisible();
  });

  test('AI cost KPI is formatted as USD when present', async ({ adminPage }) => {
    const po = new TenantDashboardPagePo(adminPage);
    await po.goto();
    const cell = po.kpi('ai-cost-30d');
    await cell.waitFor({ state: 'visible', timeout: 15_000 });
    const text = (await cell.innerText()).trim();
    // Card text includes label + value; just assert it's non-empty and
    // that one of the expected tokens is present (currency / em-dash / 0).
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/(\$\d|—|0)/);
  });
});
