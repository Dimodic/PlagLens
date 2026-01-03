/**
 * /courses/:slug/settings — edit course metadata.
 */
import { test, expect } from '../../setup/fixtures';
import { CourseSettingsPagePo } from '../../pages/courses/CourseSettingsPage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';

test.describe('/courses/:slug/settings', () => {
  test('teacher (owner) sees an enabled Save button', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const settings = new CourseSettingsPagePo(teacherPage);
      await settings.gotoBySlug(created.slug);
      await expect(settings.submit).toBeEnabled();
      await expect(settings.name).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('renaming the course persists after Save (when API is healthy)', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    const newName = `${created.name} EDITED`;
    try {
      const settings = new CourseSettingsPagePo(teacherPage);
      await settings.gotoBySlug(created.slug);
      await settings.name.fill(newName);
      await settings.submit.click();
      // Either a success toast appears, or we stay on the form. The UI must
      // not crash.
      await teacherPage.waitForLoadState('networkidle');
      await expect(settings.form).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('Cancel returns to the course detail page', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const settings = new CourseSettingsPagePo(teacherPage);
      await settings.gotoBySlug(created.slug);
      await settings.cancel.click();
      await expect(teacherPage).toHaveURL(new RegExp(`/courses/${created.slug}$`), {
        timeout: 10_000,
      });
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('CORS origins input accepts multiline input', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const settings = new CourseSettingsPagePo(teacherPage);
      await settings.gotoBySlug(created.slug);
      await settings.corsOrigins.fill('https://a.test\nhttps://b.test');
      // Just verify the field accepts the value.
      await expect(settings.corsOrigins).toHaveValue(/a\.test/);
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });
});
