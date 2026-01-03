/**
 * Teacher grades a submission — score, comment, visibility, history.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { getApiClient } from '../../helpers/token-cache';
import { uploadSubmissionAs } from '../../helpers/domain';
import { SubmissionDetailPage } from '../../pages/submissions/SubmissionDetailPage';

const uploadFor = (role: 'student1' | 'student2' | 'student3' | 'student4') =>
  uploadSubmissionAs(role);

test.describe('Submission grading (teacher)', () => {
  test('teacher submits a grade and sees confirmation', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.submitGrade(8.5, { commentVisible: true, comment: 'Looks good' });
    await expect(page.locator('body')).toContainText(/оценка сохранен|saved|saved/i, { timeout: 10000 });
  });

  test('grade input is rejected when value > max_score', async ({ page }) => {
    const sId = await uploadFor('student2');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('grade');
    await detail.gradeInput().fill('999');
    await detail.gradeSubmit().click();
    // Mantine NumberInput clamps the value automatically; either we see a validation error or the value gets clamped on save.
    // Test: the value should not exceed the max (10) after blur.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    const v = await detail.gradeInput().inputValue();
    expect(parseFloat(v)).toBeLessThanOrEqual(10);
  });

  test('grade comment_visible_to_student toggle persists after save', async ({ page }) => {
    const sId = await uploadFor('student3');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.submitGrade(7.0, { commentVisible: true });
    await expect(page.locator('body')).toContainText(/оценка сохранен|saved/i, { timeout: 10000 });

    // Reload and verify checkbox state preserved (reads from API).
    await detail.goto();
    await detail.openTab('grade');
    await expect(detail.gradeVisibleCheckbox()).toBeChecked();
  });

  test('after grade is set, "Снять оценку" button appears', async ({ page }) => {
    const sId = await uploadFor('student4');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.submitGrade(5.5);
    await expect(page.locator('body')).toContainText(/оценка сохранен|saved/i, { timeout: 10000 });
    await detail.goto();
    await detail.openTab('grade');
    await expect(detail.gradeDelete()).toBeVisible();
  });

  test('teacher deletes (clears) an existing grade', async ({ page }) => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/submissions/${sId}/grade`, { score: 6, comment_visible_to_student: false });
      expect(r.ok()).toBeTruthy();
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('grade');
    await detail.gradeDelete().click();
    await expect(page.locator('body')).toContainText(/снят|удалена|cleared/i, { timeout: 10000 });
  });

  test('student cannot reach grade tab in the UI', async ({ page }) => {
    const sId = await uploadFor('student2');
    await uiLoginAs(page, 'student2');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.expectTabHidden('grade');
  });

  test('grade is persisted via API and visible to assistant', async () => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/submissions/${sId}/grade`, { score: 9.0, comment_visible_to_student: false });
      expect(r.ok()).toBeTruthy();
    } finally {
      await api.dispose();
    }
    const api2 = await getApiClient('assistant');
    try {
      const g = await api2.get(`/submissions/${sId}/grade`);
      expect(g.ok()).toBeTruthy();
      const data = await g.json();
      expect(data.score).toBeCloseTo(9.0, 2);
    } finally {
      await api2.dispose();
    }
  });
});
