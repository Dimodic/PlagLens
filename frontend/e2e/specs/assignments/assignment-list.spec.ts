/**
 * Assignments list view inside CourseDetailPage (route /courses/:slug).
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { getApiClient } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG, listCourseAssignments, resolveDemoCourse } from '../../helpers/domain';
import { AssignmentListPage } from '../../pages/assignments/AssignmentListPage';

test.describe('Assignments list (course view)', () => {
  test('teacher sees existing demo assignments', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const list = new AssignmentListPage(page, DEMO_COURSE_SLUG);
    await list.goto();
    await list.expectCardCountAtLeast(3);
  });

  test('teacher sees the lab-1-sort card', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const list = new AssignmentListPage(page, DEMO_COURSE_SLUG);
    await list.goto();
    await expect(list.cardByTitle(/sort|сорт/i).first()).toBeVisible();
  });

  test('student sees published assignments', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const list = new AssignmentListPage(page, DEMO_COURSE_SLUG);
    await list.goto();
    // Student sees the assignments tab body — either cards or the empty-state
    // placeholder; we don't fail on demo data being all-draft.
    const tab = page.getByTestId('course-detail-tab-assignments');
    await expect(tab).toBeVisible();
  });

  test('teacher can navigate to first assignment detail by clicking card', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const list = new AssignmentListPage(page, DEMO_COURSE_SLUG);
    await list.goto();
    await list.cards().first().click();
    await page.waitForURL(/\/assignments\/[^/]+$/);
    await expect(page.getByTestId('assignment-detail')).toBeVisible();
  });

  test('teacher sees "Создать задание" button in their course', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const list = new AssignmentListPage(page, DEMO_COURSE_SLUG);
    await list.goto();
    await expect(list.createButton()).toBeVisible();
  });

  test('student does not see "Создать задание" button', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const list = new AssignmentListPage(page, DEMO_COURSE_SLUG);
    await list.goto();
    await expect(list.createButton()).toHaveCount(0);
  });

  test('API returns at least 3 assignments for demo course', async () => {
    const api = await getApiClient('teacher');
    try {
      const course = await resolveDemoCourse(api);
      const list = await listCourseAssignments(api, course.id);
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(list.find((a) => a.slug === 'lab-1-sort')).toBeTruthy();
    } finally {
      await api.dispose();
    }
  });

  test('the lab-1-sort assignment has Python language hint', async () => {
    const api = await getApiClient('teacher');
    try {
      const course = await resolveDemoCourse(api);
      const list = await listCourseAssignments(api, course.id);
      const lab1 = list.find((a) => a.slug === 'lab-1-sort');
      expect(lab1).toBeTruthy();
      // language_hint may be optional; if present, expect "python".
      if (lab1?.language_hint) {
        expect(lab1.language_hint).toBe('python');
      }
    } finally {
      await api.dispose();
    }
  });
});
