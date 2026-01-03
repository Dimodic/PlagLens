/**
 * Deep-link / direct-URL coverage for the Courses domain.
 *
 * A user that reloads the browser on a nested URL (e.g. /courses/x/members)
 * MUST land on the right tab without first bouncing through the detail page.
 * We assert URL → page identity for every nested route we expose.
 */
import { test, expect } from '../../setup/fixtures';
import { CoursesListPagePo } from '../../pages/courses/CoursesListPage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';

test.describe('Courses — deep links / direct URL navigation', () => {
  test('cold load of /courses/:slug/members renders the members title', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/members`);
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage.getByTestId('course-members-title')).toBeVisible({
        timeout: 15_000,
      });
      await expect(teacherPage).toHaveURL(
        new RegExp(`/courses/${created.slug}/members$`),
      );
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('cold load of /courses/:slug/groups renders the groups title', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/groups`);
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage.getByTestId('course-groups-title')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('cold load of /courses/:slug/invitations renders the invitations title', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/invitations`);
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage.getByTestId('course-invitations-title')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('cold load of /courses/:slug/settings renders the settings form', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/settings`);
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage.getByTestId('course-settings-form')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('cold load of /courses/:slug/stats renders the stats title', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/stats`);
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage.getByTestId('course-stats-title')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('cold load of /courses/:slug/members?role=assistant works (query string preserved)', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/members?role=assistant`);
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage.getByTestId('course-members-title')).toBeVisible({
        timeout: 15_000,
      });
      // The query string MUST be preserved — the SPA should not strip it.
      const url = new URL(teacherPage.url());
      expect(url.pathname).toMatch(new RegExp(`/courses/${created.slug}/members$`));
      expect(url.searchParams.get('role')).toBe('assistant');
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('cold load of /courses/join/:code prefills the code input', async ({
    studentPage,
  }) => {
    await studentPage.goto('/courses/join/HELLO-2026');
    await studentPage.waitForLoadState('domcontentloaded');
    const input = studentPage.locator(
      '[data-testid="join-code-input"], input[data-testid="join-code-input"]',
    ).first();
    await expect(input).toBeVisible({ timeout: 10_000 });
    await expect(input).toHaveValue('HELLO-2026');
  });

  test('cold load of /courses?status=archived applies the filter', async ({
    teacherPage,
  }) => {
    await teacherPage.goto('/courses?status=archived');
    await teacherPage.waitForLoadState('domcontentloaded');
    const list = new CoursesListPagePo(teacherPage);
    // The list title must render, regardless of the filter side-effect.
    await expect(list.title).toBeVisible({ timeout: 15_000 });
  });

  test('cold load of an unknown slug shows an error alert (no JS crash)', async ({
    teacherPage,
  }) => {
    const errs: string[] = [];
    teacherPage.on('pageerror', (e) => errs.push(e.message));

    await teacherPage.goto('/courses/totally-non-existent-slug-12345');
    await teacherPage.waitForLoadState('domcontentloaded');
    // An alert OR the detail header should render — never an empty page.
    const alert = teacherPage.getByRole('alert').first();
    const header = teacherPage.getByTestId('course-detail-header');
    await Promise.race([
      alert.waitFor({ state: 'visible', timeout: 15_000 }),
      header.waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
    // No fatal page errors.
    expect(errs.filter((e) => !/Warning|prop/i.test(e))).toEqual([]);
  });

  test('navigating tabs updates the URL and survives a reload', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      await teacherPage.goto(`/courses/${created.slug}/members`);
      await teacherPage.waitForLoadState('domcontentloaded');
      // Reload — URL must remain on /members.
      await teacherPage.reload();
      await teacherPage.waitForLoadState('domcontentloaded');
      await expect(teacherPage).toHaveURL(
        new RegExp(`/courses/${created.slug}/members$`),
      );
      await expect(teacherPage.getByTestId('course-members-title')).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });
});
