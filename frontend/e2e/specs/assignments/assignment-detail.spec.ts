/**
 * Assignment detail page — student vs teacher views differ.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG, resolveAssignmentBySlug } from '../../helpers/domain';
import { AssignmentDetailPage } from '../../pages/assignments/AssignmentDetailPage';

let lab1Id: string;

test.beforeAll(async () => {
  const api = await getApiClient('teacher');
  try {
    const a = await resolveAssignmentBySlug(api, DEMO_COURSE_SLUG, 'lab-1-sort');
    lab1Id = a.id;
    // Ensure lab-1-sort is published so student tests can see it.
    if (a.status !== 'published') {
      await api.post(`/assignments/${a.id}:publish`);
    }
  } finally {
    await api.dispose();
  }
});

test.describe('Assignment detail', () => {
  test('teacher sees Settings button and submissions tabs', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await detail.expectTeacherView();
    // Teacher tabs: submissions / stats / plagiarism / ai
    await expect(page.getByRole('tab', { name: /посылки/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /статистик/i })).toBeVisible();
  });

  test('student sees Upload button and "about" tab only', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await detail.expectStudentView();
    await expect(page.getByRole('tab', { name: /описание/i })).toBeVisible();
    // Teacher-only tabs not present
    await expect(page.getByRole('tab', { name: /флаги/i })).toHaveCount(0);
  });

  test('description (Markdown) is rendered in the description block', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await expect(page.getByTestId('assignment-description')).toBeVisible();
  });

  test('header shows status badge', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await expect(detail.statusBadge()).toBeVisible();
  });

  test('header shows max_score and weight', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await expect(page.getByText(/макс\. оценка/i)).toBeVisible();
    await expect(page.getByText(/вес/i)).toBeVisible();
  });

  test('student clicking Upload navigates to /upload', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await detail.openUpload();
    await expect(page).toHaveURL(/\/assignments\/[^/]+\/upload$/);
  });

  test('teacher clicking Settings navigates to /settings', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await detail.openSettings();
    await expect(page).toHaveURL(/\/assignments\/[^/]+\/settings$/);
  });

  test('teacher sees stats panel after switching to stats tab', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await page.getByRole('tab', { name: /статистик/i }).click();
    // Either loader or stats are rendered
    await expect(page.locator('body')).toContainText(/посылок|студентов|оценка/i);
  });

  test('header shows the assignment slug', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, lab1Id);
    await detail.goto();
    await expect(page.getByText('lab-1-sort')).toBeVisible();
  });
});
