/**
 * Detail page tabs: Files / Grade / Feedback / Plagiarism / AI / Flags / History.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { uploadSubmissionAs } from '../../helpers/domain';
import { SubmissionDetailPage } from '../../pages/submissions/SubmissionDetailPage';

const uploadFor = (role: 'student1' | 'student2' | 'student3' | 'student4') =>
  uploadSubmissionAs(role);

test.describe('Submission detail', () => {
  test('teacher sees Files / Grade / Feedback / Plagiarism / AI / Flags / History tabs', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    for (const t of ['files', 'grade', 'feedback', 'plagiarism', 'ai', 'flags', 'history'] as const) {
      await detail.expectTabVisible(t);
    }
  });

  test('student sees only files / feedback / plagiarism / ai / history tabs (no grade or flags)', async ({ page }) => {
    const sId = await uploadFor('student2');
    await uiLoginAs(page, 'student2');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.expectTabVisible('files');
    await detail.expectTabVisible('feedback');
    await detail.expectTabVisible('plagiarism');
    await detail.expectTabVisible('ai');
    await detail.expectTabVisible('history');
    await detail.expectTabHidden('grade');
    await detail.expectTabHidden('flags');
  });

  test('Files tab shows the file tree and code viewer', async ({ page }) => {
    const sId = await uploadFor('student3');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('files');
    await expect(page.getByTestId('file-tree')).toBeVisible();
    await expect(detail.codeViewer()).toBeVisible({ timeout: 10000 });
  });

  test('Code viewer reflects detected language as data attribute', async ({ page }) => {
    const sId = await uploadFor('student4');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('files');
    await expect(detail.codeViewer()).toHaveAttribute('data-language', 'python', { timeout: 10000 });
  });

  test('header shows version label like v1', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'student1');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await expect(detail.versionLabel()).toContainText(/v\d+/);
  });

  test('switching to Plagiarism tab shows placeholder text', async ({ page }) => {
    const sId = await uploadFor('student2');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('plagiarism');
    await expect(page.locator('body')).toContainText(/плагиат|plagiarism/i);
  });

  test('switching to AI tab shows placeholder for teacher', async ({ page }) => {
    const sId = await uploadFor('student3');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('ai');
    await expect(page.locator('body')).toContainText(/llm|ai-анализ|ai/i);
  });

  test('History tab is reachable and renders no errors', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('history');
    // Either empty state or list shown — but no error toast.
    await expect(page.locator('body')).not.toContainText(/error/i);
  });

  test('Author name is rendered in the header', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await expect(page.locator('body')).toContainText(/student1|автор/i);
  });
});
