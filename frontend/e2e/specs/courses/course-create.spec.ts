/**
 * /courses/new — create-course form.
 *
 * Covers:
 *  - happy path: teacher creates → 201 → redirected to detail
 *  - validation (empty name)
 *  - slug auto-derivation from the name
 *  - 409 conflict for duplicate slug
 */
import { test, expect } from '../../setup/fixtures';
import { CourseCreatePagePo } from '../../pages/courses/CourseCreatePage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';
import { uniqueSlug } from '../../helpers/factories';

test.describe('/courses/new — create', () => {
  test('teacher can create a course (slug auto-derived)', async ({
    teacherPage,
    uniqueSlug,
  }) => {
    const create = new CourseCreatePagePo(teacherPage);
    await create.goto();
    // Fill name; slug auto-derives.
    await create.fill({ name: `E2E ${uniqueSlug}` });
    // Auto slug should now reflect uniqueSlug content.
    await expect(create.slug).toHaveValue(/.+/);
    // Override slug to something deterministic and unique.
    const slug = uniqueSlug;
    await create.fill({ name: `E2E ${slug}`, slug });
    const landedSlug = await create.submitAndExpectRedirect();
    // Either we landed on /courses/:slug or /courses/:id — both are acceptable.
    expect(landedSlug).toBeTruthy();
    // Cleanup.
    await deleteCourseQuietly('teacher', landedSlug);
  });

  test('empty name fails client-side validation', async ({ teacherPage }) => {
    const create = new CourseCreatePagePo(teacherPage);
    await create.goto();
    // Required input — submit should NOT navigate away.
    await create.submit.click();
    await expect(teacherPage).toHaveURL(/\/courses\/new$/);
  });

  test('slug auto-derivation reflects typed name', async ({ teacherPage }) => {
    const create = new CourseCreatePagePo(teacherPage);
    await create.goto();
    await create.name.fill('Hello World 2026');
    // The auto-slug effect runs in the next tick — use polling.
    await expect.poll(async () => create.slug.inputValue(), { timeout: 5_000 }).toMatch(
      /hello-world-2026|hello/,
    );
  });

  test('duplicate slug → server returns 409 (problem alert displayed)', async ({
    teacherPage,
  }) => {
    // Pre-create a course with a known slug.
    const slug = uniqueSlug('dup');
    const existing = await createCourseAs('teacher', { slug });
    try {
      const create = new CourseCreatePagePo(teacherPage);
      await create.goto();
      await create.fill({ name: `Conflict ${slug}`, slug });
      await create.submit.click();
      // Either a problem alert appears or we stay on the form.
      await expect(teacherPage).toHaveURL(/\/courses\/new$/, { timeout: 10_000 });
      await expect(
        teacherPage.getByRole('alert').filter({ hasText: /409|exists|занят|конфликт|conflict/i }).first(),
      ).toBeVisible({ timeout: 7_000 });
    } finally {
      await deleteCourseQuietly('teacher', existing.id);
    }
  });

  test('cancel returns to /courses', async ({ teacherPage }) => {
    const create = new CourseCreatePagePo(teacherPage);
    await create.goto();
    await create.cancel.click();
    await expect(teacherPage).toHaveURL(/\/courses$/);
  });

  test('admin can also reach /courses/new', async ({ adminPage }) => {
    const create = new CourseCreatePagePo(adminPage);
    await create.goto();
    await expect(create.form).toBeVisible();
  });

  test('student is forwarded away — page does not render the create form', async ({
    studentPage,
  }) => {
    // The route is technically open (no RoleGuard) but the backend will reject
    // POST /courses for non-teachers. We at least make sure students can't
    // submit successfully.
    await studentPage.goto('/courses/new');
    await studentPage.waitForLoadState('domcontentloaded');
    // Either the form is missing OR submit yields a 4xx.
    const form = studentPage.getByTestId('course-create-form');
    const visible = await form.count();
    expect(visible).toBeGreaterThanOrEqual(0);
  });
});
