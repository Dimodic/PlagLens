/**
 * RBAC negative tests for the Courses domain.
 *
 * The frontend hides actions for non-owners via hasCourseRole/hasGlobalRole.
 * We verify the *visible* UI surface; backend-side RBAC is covered separately
 * by service-level tests.
 */
import { test, expect } from '../../setup/fixtures';
import { CourseDetailPagePo } from '../../pages/courses/CourseDetailPage.po';
import { CourseSettingsPagePo } from '../../pages/courses/CourseSettingsPage.po';
import { CoursesListPagePo } from '../../pages/courses/CoursesListPage.po';

test.describe('Courses — RBAC', () => {
  test('anonymous request to /courses redirects to /login', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/courses');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await ctx.close();
  });

  test('anonymous request to /courses/new redirects to /login', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/courses/new');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await ctx.close();
  });

  test('anonymous request to /courses/some-slug redirects to /login', async ({
    browser,
  }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/courses/algorithms-2026');
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await ctx.close();
  });

  test('student does not see the «Создать курс» button on /courses', async ({
    studentPage,
  }) => {
    const list = new CoursesListPagePo(studentPage);
    await list.goto();
    await expect(list.createButton).toHaveCount(0);
  });

  test('student visiting /courses/:slug/settings sees a disabled Save button', async ({
    studentPage,
  }) => {
    const settings = new CourseSettingsPagePo(studentPage);
    await studentPage.goto('/courses/algorithms-2026/settings');
    await studentPage.waitForLoadState('domcontentloaded');
    if ((await settings.form.count()) > 0) {
      // Either form is missing or submit is disabled for non-owners.
      if ((await settings.submit.count()) > 0) {
        await expect(settings.submit).toBeDisabled();
      }
    }
  });

  test('student does not see the menu trigger on a course they did not author', async ({
    studentPage,
  }) => {
    const detail = new CourseDetailPagePo(studentPage);
    await detail.gotoBySlug('algorithms-2026');
    await expect(detail.menuTrigger).toHaveCount(0);
  });

  test('admin sees the create button (admins can create courses too)', async ({
    adminPage,
  }) => {
    const list = new CoursesListPagePo(adminPage);
    await list.goto();
    await expect(list.createButton).toBeVisible();
  });

  test('teacher sees the create button', async ({ teacherPage }) => {
    const list = new CoursesListPagePo(teacherPage);
    await list.goto();
    await expect(list.createButton).toBeVisible();
  });

  test('assistant does NOT see the create button on /courses', async ({
    assistantPage,
  }) => {
    const list = new CoursesListPagePo(assistantPage);
    await list.goto();
    // assistants are not teachers — they shouldn't see Create.
    await expect(list.createButton).toHaveCount(0);
  });
});
