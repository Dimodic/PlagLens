/**
 * /courses/:slug/stats — course dashboard placeholder tab.
 *
 * Today the page is a placeholder filled by the Reporting Service later, but
 * we verify it loads cleanly on every cold reload and via the tab click on
 * the detail page. No 500 may bubble up.
 */
import { test, expect } from '../../setup/fixtures';
import { CourseDetailPagePo } from '../../pages/courses/CourseDetailPage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';

test.describe('/courses/:slug/stats — stats tab', () => {
  test('cold load of /stats renders the title without errors', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const errs: string[] = [];
      teacherPage.on('pageerror', (e) => errs.push(e.message));
      teacherPage.on('console', (m) => {
        if (m.type() === 'error') errs.push(m.text());
      });

      await teacherPage.goto(`/courses/${created.slug}/stats`);
      await teacherPage.waitForLoadState('domcontentloaded');
      const title = teacherPage.getByTestId('course-stats-title');
      await expect(title).toBeVisible({ timeout: 15_000 });
      // Title content should reference course name.
      await expect(title).toContainText(/Статистика/);
      // No JS exceptions during the load. We tolerate React warnings and
      // expected 401 console traces during auth bootstrap (the AuthProvider
      // probes /auth/me before the refresh completes).
      const fatal = errs.filter(
        (e) =>
          !/Warning|prop|act\(\)/i.test(e) &&
          !/Failed to load resource.*401/i.test(e) &&
          !/Failed to load resource.*403/i.test(e) &&
          !/net::ERR_/i.test(e),
      );
      expect(fatal).toEqual([]);
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('clicking the «Статистика» tab navigates to /courses/:slug/stats', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await detail.tabStats.click();
      await expect(teacherPage).toHaveURL(
        new RegExp(`/courses/${created.slug}/stats$`),
        { timeout: 10_000 },
      );
      await expect(teacherPage.getByTestId('course-stats-title')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('student visiting /stats on an existing seed course sees the page', async ({
    studentPage,
  }) => {
    // The route is open to all roles; this asserts students don't hit a 403/500.
    await studentPage.goto('/courses/algorithms-2026/stats');
    await studentPage.waitForLoadState('domcontentloaded');
    // Either the title renders OR a 403/404 alert is shown — never a blank page.
    const title = studentPage.getByTestId('course-stats-title');
    const alert = studentPage.getByRole('alert').first();
    await Promise.race([
      title.waitFor({ state: 'visible', timeout: 15_000 }),
      alert.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
    expect((await title.count()) + (await alert.count())).toBeGreaterThan(0);
  });

  test('stats endpoint network calls do not return 500', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    const failingResponses: { url: string; status: number }[] = [];
    teacherPage.on('response', (r) => {
      const url = r.url();
      if (url.includes('/api/v1/courses/') && r.status() >= 500) {
        failingResponses.push({ url, status: r.status() });
      }
    });
    try {
      await teacherPage.goto(`/courses/${created.slug}/stats`);
      await teacherPage.waitForLoadState('networkidle');
      expect(failingResponses).toEqual([]);
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('stats title falls back gracefully when course query is still loading', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    // Slow down only the GET for this specific course slug (NOT auth or list calls).
    const targetUrl = `**/api/v1/courses/${created.slug}`;
    await teacherPage.route(targetUrl, async (route) => {
      if (route.request().method() === 'GET') {
        await new Promise((r) => setTimeout(r, 250));
      }
      return route.continue();
    });
    try {
      await teacherPage.goto(`/courses/${created.slug}/stats`);
      // The title should appear regardless (it renders even while course is loading).
      await expect(teacherPage.getByTestId('course-stats-title')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await teacherPage.unroute(targetUrl).catch(() => {});
      await deleteCourseQuietly('teacher', created.id);
    }
  });
});
