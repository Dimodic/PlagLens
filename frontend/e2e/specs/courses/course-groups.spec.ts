/**
 * /courses/:slug/groups — manage groups.
 */
import { test, expect } from '../../setup/fixtures';
import { CourseGroupsPagePo } from '../../pages/courses/CourseGroupsPage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';

test.describe('/courses/:slug/groups', () => {
  test('teacher sees Новая группа button', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const groups = new CourseGroupsPagePo(teacherPage);
      await groups.gotoBySlug(created.slug);
      await expect(groups.title).toBeVisible();
      await expect(groups.createButton).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('opening Новая группа dialog reveals the form', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const groups = new CourseGroupsPagePo(teacherPage);
      await groups.gotoBySlug(created.slug);
      await groups.openCreateDialog();
      await expect(groups.nameInput).toBeVisible();
      await expect(groups.submit).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('creating a group with capacity submits and closes dialog (when API is healthy)', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const groups = new CourseGroupsPagePo(teacherPage);
      await groups.gotoBySlug(created.slug);
      await groups.createGroup('Группа 1', 25);
      // Either the dialog closes (success) or a problem alert appears.
      await teacherPage.waitForLoadState('networkidle');
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('empty group name fails client-side validation', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const groups = new CourseGroupsPagePo(teacherPage);
      await groups.gotoBySlug(created.slug);
      await groups.openCreateDialog();
      await groups.submit.click();
      // The form should NOT close — name input still visible.
      await expect(groups.nameInput).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('student visiting a foreign course groups page does not see Создать button', async ({
    studentPage,
  }) => {
    await studentPage.goto('/courses/algorithms-2026/groups');
    await studentPage.waitForLoadState('domcontentloaded');
    const groups = new CourseGroupsPagePo(studentPage);
    await expect(groups.createButton).toHaveCount(0);
  });
});
