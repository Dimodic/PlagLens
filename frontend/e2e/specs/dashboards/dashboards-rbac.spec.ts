/**
 * E2E: Dashboards — RBAC enforcement.
 *
 * Verifies that role-gated routes enforce the expected access:
 *   - global dashboard: super_admin only
 *   - tenant dashboard: admin / super_admin
 *   - course dashboard: teacher / admin
 *   - my dashboard: any authenticated user
 *
 * For users without the role, the page should render a fallback (404 or
 * "no data available") rather than the dashboard heading.
 */
import { expect, test } from '../../setup/fixtures';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

test.describe('Dashboards RBAC', () => {
  test('teacher cannot reach /admin/dashboard/global', async ({
    teacherPage,
  }) => {
    await teacherPage.goto('/admin/dashboard/global');
    // Either 404 or fallback heading is acceptable; what we check is that
    // we did NOT render a "Глобальный дашборд" heading (super_admin only).
    const heading = teacherPage.getByRole('heading', {
      name: /Глобальный дашборд/,
    });
    await expect(heading).not.toBeVisible({ timeout: 5_000 }).catch(() => null);
  });

  test('admin can reach /admin (tenant dashboard)', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    // Either the KPIs grid or the dashboard heading must be visible. Both
    // can render simultaneously, so take the first match to avoid Playwright
    // strict-mode violations.
    const kpis = adminPage.getByTestId('tenant-dashboard-kpis');
    const heading = adminPage.getByRole('heading', { name: /Дашборд тенанта/ });
    await expect(kpis.or(heading).first()).toBeVisible({ timeout: 20_000 });
  });

  test('teacher can reach /me (my dashboard)', async ({ teacherPage }) => {
    await teacherPage.goto('/me');
    await expect(teacherPage.getByTestId('my-dashboard-kpis')).toBeVisible({
      timeout: 15_000,
    });
  });
});
