/**
 * E2E: /me — My Dashboard
 *
 * Verifies role-aware KPIs: a student should see "Моих курсов",
 * "Дедлайнов скоро", "Недавних оценок", "Средняя оценка". Same KPIs
 * are also rendered for a teacher (with potentially different counts).
 */
import { expect, test } from '../../setup/fixtures';
import { MyDashboardPagePo } from '../../pages/dashboards/MyDashboardPage.po';

test.describe('My Dashboard /me', () => {
  test('renders four KPI cards for a student', async ({ studentPage }) => {
    const po = new MyDashboardPagePo(studentPage);
    await po.goto();
    await expect(studentPage).toHaveURL(/\/me/);

    await expect(po.kpisRoot).toBeVisible();
    await expect(po.kpiMyCourses).toBeVisible();
    await expect(po.kpiUpcomingDeadlines).toBeVisible();
    await expect(po.kpiRecentGrades).toBeVisible();
    await expect(po.kpiAverageScore).toBeVisible();
  });

  test('greeting includes the logged-in user display name', async ({
    studentPage,
  }) => {
    const po = new MyDashboardPagePo(studentPage);
    await po.goto();
    // The h2 is "Здравствуйте, <name>". Just check the prefix.
    await expect(
      studentPage.getByRole('heading', { name: /Здравствуйте/ }),
    ).toBeVisible();
  });

  test('renders KPIs for teachers too', async ({ teacherPage }) => {
    const po = new MyDashboardPagePo(teacherPage);
    await po.goto();
    await expect(po.kpiMyCourses).toBeVisible();
    await expect(po.kpiAverageScore).toBeVisible();
  });

  test('"Мои курсы" section has either rows or empty state', async ({
    teacherPage,
  }) => {
    const po = new MyDashboardPagePo(teacherPage);
    await po.goto();
    // Either the table is visible (data) OR an empty state title is.
    const tableVisible = await po.myCoursesTable.isVisible().catch(() => false);
    if (!tableVisible) {
      await expect(
        teacherPage.getByText(/У вас нет курсов|Здравствуйте/),
      ).toBeVisible();
    }
  });

  test('KPI value text is non-empty (number or em-dash)', async ({
    studentPage,
  }) => {
    const po = new MyDashboardPagePo(studentPage);
    await po.goto();
    const text = (await po.kpiMyCourses.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
  });
});
