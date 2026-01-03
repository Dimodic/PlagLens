/**
 * /courses/:slug — detail page.
 *
 * Covers:
 *  - header renders course meta
 *  - tabs render (assignments, members, groups, invitations, stats)
 *  - owner sees Settings + menu actions
 *  - student does not see Settings/edit buttons
 */
import { test, expect } from '../../setup/fixtures';
import { CourseDetailPagePo } from '../../pages/courses/CourseDetailPage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';

test.describe('/courses/:slug — detail', () => {
  test('teacher sees title, status badge, slug, settings button', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await expect(detail.title).toContainText(created.name);
      await expect(detail.status).toBeVisible();
      await expect(detail.slug).toHaveText(created.slug);
      await expect(detail.settingsButton).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('teacher sees all 5 tabs', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await expect(detail.tabAssignments).toBeVisible();
      await expect(detail.tabMembers).toBeVisible();
      await expect(detail.tabGroups).toBeVisible();
      await expect(detail.tabInvitations).toBeVisible();
      await expect(detail.tabStats).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('teacher sees the Создать задание button', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await expect(detail.createAssignmentButton).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('clicking Members tab navigates to /courses/:slug/members', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await detail.tabMembers.click();
      await expect(teacherPage).toHaveURL(new RegExp(`/courses/${created.slug}/members$`), {
        timeout: 10_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('clicking Groups tab navigates to /courses/:slug/groups', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await detail.tabGroups.click();
      await expect(teacherPage).toHaveURL(new RegExp(`/courses/${created.slug}/groups$`), {
        timeout: 10_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('clicking Invitations tab navigates to /courses/:slug/invitations', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await detail.tabInvitations.click();
      await expect(teacherPage).toHaveURL(new RegExp(`/courses/${created.slug}/invitations$`), {
        timeout: 10_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('opening menu shows Дублировать and Архивировать (active course)', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await detail.openMenu();
      await expect(detail.duplicateMenuItem).toBeVisible();
      await expect(detail.archiveMenuItem).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('archive flow — open menu, confirm dialog, status changes to «В архиве»', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(teacherPage);
      await detail.gotoBySlug(created.slug);
      await detail.clickArchive();
      // Confirm dialog (Mantine Modal with Архивировать button).
      await detail.confirmArchive();
      // Wait for status badge to update.
      await expect.poll(async () => detail.status.textContent(), { timeout: 10_000 }).toMatch(
        /В архиве/,
      );
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('student does not see Settings button on a course they joined', async ({
    studentPage,
  }) => {
    // Student visits an existing seed course (algorithms-2026).
    const detail = new CourseDetailPagePo(studentPage);
    await detail.gotoBySlug('algorithms-2026');
    // Either a 404 alert OR a header without Settings.
    const settingsCount = await detail.settingsButton.count();
    expect(settingsCount).toBe(0);
  });

  test('admin sees the menu trigger', async ({ adminPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const detail = new CourseDetailPagePo(adminPage);
      await detail.gotoBySlug(created.slug);
      await expect(detail.menuTrigger).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });
});
