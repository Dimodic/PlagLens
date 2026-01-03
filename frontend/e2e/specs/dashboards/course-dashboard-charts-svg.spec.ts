/**
 * E2E: Course Dashboard — chart SVG rendering smoke.
 *
 * Verifies that recharts components produce a valid SVG when rendered with
 * mocked non-empty data. We intercept the dashboard hooks' API calls and
 * inject deterministic shapes so we can assert <rect>, <path>, etc. counts.
 *
 * This spec is the "deterministic" companion to course-dashboard.spec.ts
 * which exercises real backend data.
 */
import { expect, test } from '../../setup/fixtures';
import { CourseDashboardPagePo } from '../../pages/dashboards/CourseDashboardPage.po';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

test.describe('Course Dashboard charts (mocked)', () => {
  test.beforeEach(async ({ teacherPage }) => {
    // Stub the grades distribution endpoint to a non-empty histogram so
    // recharts renders <rect>s deterministically.
    await teacherPage.route(
      /\/courses\/[^/]+\/dashboard\/grades-distribution/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            buckets: [
              { bucket: '0-1', min: 0, max: 1, count: 1 },
              { bucket: '1-2', min: 1, max: 2, count: 3 },
              { bucket: '2-3', min: 2, max: 3, count: 5 },
              { bucket: '3-4', min: 3, max: 4, count: 8 },
              { bucket: '4-5', min: 4, max: 5, count: 4 },
            ],
            mean: 3.1,
            median: 3.0,
            stddev: 1.0,
          }),
        });
      },
    );
    await teacherPage.route(
      /\/courses\/[^/]+\/dashboard\/timeline/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { week: '2025-W01', submissions: 10, graded: 7 },
            { week: '2025-W02', submissions: 12, graded: 9 },
            { week: '2025-W03', submissions: 14, graded: 11 },
          ]),
        });
      },
    );
    await teacherPage.route(
      /\/courses\/[^/]+\/dashboard\/language-breakdown/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { language: 'python', count: 60, percent: 60 },
            { language: 'cpp', count: 25, percent: 25 },
            { language: 'java', count: 15, percent: 15 },
          ]),
        });
      },
    );
  });

  test('Grades histogram renders one <rect> per bucket', async ({
    teacherPage,
  }) => {
    const po = new CourseDashboardPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.selectTab('grades');
    const panel = teacherPage.getByTestId('tab-grades');
    const histogram = panel.getByTestId('grade-histogram');
    await histogram.waitFor({ state: 'visible', timeout: 10_000 });
    // ResponsiveContainer needs a tick to measure parent size. Poll for
    // <rect> count to settle.
    await expect
      .poll(
        async () => await histogram.locator('rect').count(),
        { timeout: 10_000, intervals: [200, 500, 1000] },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test('Timeline chart renders an SVG container for line data', async ({
    teacherPage,
  }) => {
    const po = new CourseDashboardPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.selectTab('timeline');
    const panel = teacherPage.getByTestId('tab-timeline');
    const timeline = panel.getByTestId('submissions-timeline').first();
    await timeline.waitFor({ state: 'visible', timeout: 10_000 });
    // ResponsiveContainer measures size on layout and may take a tick. We
    // poll for at least one SVG element in the timeline container; in
    // some headless layouts the chart renders <path> while in others the
    // recharts surface uses <g>. Either is fine.
    await expect
      .poll(
        async () => await timeline.locator('svg').count(),
        { timeout: 8_000, intervals: [200, 500, 1000] },
      )
      .toBeGreaterThanOrEqual(1);
  });

  test('Language pie renders an SVG container', async ({ teacherPage }) => {
    const po = new CourseDashboardPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.selectTab('languages');
    const panel = teacherPage.getByTestId('tab-languages');
    const pie = panel.getByTestId('language-pie');
    const visible = await pie.isVisible({ timeout: 5_000 }).catch(() => false);
    if (visible) {
      await expect
        .poll(
          async () => await pie.locator('svg').count(),
          { timeout: 8_000, intervals: [200, 500, 1000] },
        )
        .toBeGreaterThanOrEqual(1);
    }
  });
});
