/**
 * E2E: Dashboards — empty state rendering with mocked empty payloads.
 *
 * When endpoints return empty arrays/null payloads, the components must
 * fall back to EmptyState rather than throwing or rendering broken charts.
 */
import { expect, test } from '../../setup/fixtures';
import { CourseDashboardPagePo } from '../../pages/dashboards/CourseDashboardPage.po';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

test.describe('Dashboards empty states (mocked)', () => {
  test('Grades distribution returns empty buckets → "Нет оценок" empty state', async ({
    teacherPage,
  }) => {
    await teacherPage.route(
      /\/courses\/[^/]+\/dashboard\/grades-distribution/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            buckets: [],
            mean: null,
            median: null,
            stddev: null,
          }),
        });
      },
    );
    const po = new CourseDashboardPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.selectTab('grades');
    const panel = teacherPage.getByTestId('tab-grades');
    await expect(panel.getByText(/Нет оценок/)).toBeVisible();
  });

  test('Timeline returns empty array → "Нет данных" empty state', async ({
    teacherPage,
  }) => {
    await teacherPage.route(
      /\/courses\/[^/]+\/dashboard\/timeline/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      },
    );
    const po = new CourseDashboardPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.selectTab('timeline');
    const panel = teacherPage.getByTestId('tab-timeline');
    await expect(panel.getByText(/Нет данных|Пока нет/).first()).toBeVisible();
  });
});
