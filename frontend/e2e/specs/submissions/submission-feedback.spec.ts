/**
 * Feedback CRUD: add, publish/unpublish, delete; student sees only published.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { getApiClient } from '../../helpers/token-cache';
import { uploadSubmissionAs } from '../../helpers/domain';
import { SubmissionDetailPage } from '../../pages/submissions/SubmissionDetailPage';

const uploadFor = (role: 'student1' | 'student2' | 'student3' | 'student4') =>
  uploadSubmissionAs(role);

test.describe('Submission feedback', () => {
  test('teacher adds Markdown feedback (visible to student)', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.addFeedback('## Хорошо!\n\n*Solid solution.*', true);
    await expect(page.locator('body')).toContainText(/Хорошо|комментарий добавлен/i, { timeout: 10000 });
  });

  test('teacher adds hidden feedback by default', async ({ page }) => {
    const sId = await uploadFor('student2');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.addFeedback('Internal note', false);
    await expect(page.locator('body')).toContainText(/internal note/i, { timeout: 10000 });
  });

  test('feedback form Submit is disabled when body is empty', async ({ page }) => {
    const sId = await uploadFor('student3');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('feedback');
    await expect(detail.feedbackSubmit()).toBeDisabled();
  });

  test('feedback creates an entry visible in the feedback list', async ({ page }) => {
    const sId = await uploadFor('student4');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.addFeedback('Очень хорошее решение', true);
    // Match the rendered feedback list item (testid prefixed with feedback-
    // but NOT the new-comment form). The list item contains the body.
    await expect(
      page
        .locator('[data-testid^="feedback-"]:not([data-testid^="feedback-form"])')
        .filter({ hasText: 'Очень хорошее решение' })
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('publish/unpublish toggle changes badge label', async ({ page }) => {
    const sId = await uploadFor('student1');
    // create hidden feedback via API
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/submissions/${sId}/feedback`, {
        body: 'Hidden initially',
        visible_to_student: false,
      });
      expect(r.ok()).toBeTruthy();
    } finally {
      await api.dispose();
    }

    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('feedback');
    const fbCard = page.locator('[data-testid^="feedback-"]').filter({ hasText: 'Hidden initially' }).first();
    await expect(fbCard).toBeVisible();
    await expect(fbCard).toContainText(/скрыто/i);
    // Click publish (eye icon)
    await fbCard.getByRole('button', { name: /опубликовать/i }).click();
    await expect.poll(async () => fbCard.textContent(), { timeout: 5000 }).toMatch(/видно/i);
  });

  test('teacher deletes a feedback item', async ({ page }) => {
    const sId = await uploadFor('student2');
    const api = await getApiClient('teacher');
    try {
      await api.post(`/submissions/${sId}/feedback`, { body: 'Will be deleted', visible_to_student: true });
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('feedback');
    const fbCard = page.locator('[data-testid^="feedback-"]').filter({ hasText: 'Will be deleted' }).first();
    await fbCard.getByRole('button', { name: /удалить/i }).click();
    await expect(page.locator('body')).toContainText(/удалён|удалена|удалено/i, { timeout: 10000 });
  });

  test('student sees only published feedback', async ({ page }) => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('teacher');
    try {
      await api.post(`/submissions/${sId}/feedback`, { body: 'Hidden from student', visible_to_student: false });
      await api.post(`/submissions/${sId}/feedback`, { body: 'Visible to student', visible_to_student: true });
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'student1');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('feedback');
    await expect(page.locator('body')).toContainText(/Visible to student/);
    // The hidden item should not be visible.
    await expect(page.locator('body')).not.toContainText(/Hidden from student/);
  });

  test('student cannot see feedback management buttons', async ({ page }) => {
    const sId = await uploadFor('student2');
    const api = await getApiClient('teacher');
    try {
      await api.post(`/submissions/${sId}/feedback`, { body: 'Pub feedback', visible_to_student: true });
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'student2');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('feedback');
    // No "Добавить" button for students (no feedback-form-submit testid)
    await expect(detail.feedbackSubmit()).toHaveCount(0);
  });
});
