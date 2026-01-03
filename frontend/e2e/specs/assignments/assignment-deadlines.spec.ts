/**
 * Per-user deadline extensions.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG, resolveDemoCourse } from '../../helpers/domain';
import { uniqueSlug } from '../../helpers/factories';
import { AssignmentDeadlinesPage } from '../../pages/assignments/AssignmentDeadlinesPage';

async function createDeadlineAssignment(): Promise<string> {
  const api = await getApiClient('teacher');
  try {
    const course = await resolveDemoCourse(api);
    const slug = uniqueSlug('deadline');
    const futureSoft = new Date(Date.now() + 7 * 86400_000).toISOString();
    const futureHard = new Date(Date.now() + 14 * 86400_000).toISOString();
    const r = await api.post(`/courses/${course.id}/assignments`, {
      slug,
      title: `Deadlines ${slug}`,
      description: 'Deadline tests',
      max_score: 10,
      weight: 1,
      deadline_soft_at: futureSoft,
      deadline_hard_at: futureHard,
    });
    const a = await r.json();
    return a.id as string;
  } finally {
    await api.dispose();
  }
}

async function fetchStudentId(role: 'student2' | 'student3' = 'student2'): Promise<string> {
  const api = await getApiClient(role);
  try {
    const me = await api.me();
    return me.id as string;
  } finally {
    await api.dispose();
  }
}

test.describe('Assignment deadlines', () => {
  test('teacher opens deadlines page and sees empty state', async ({ page }) => {
    const id = await createDeadlineAssignment();
    await uiLoginAs(page, 'teacher');
    const dl = new AssignmentDeadlinesPage(page, id);
    await dl.goto();
    await expect(page.locator('body')).toContainText(/нет продлений|empty|пусто/i);
  });

  test('teacher opens add-extension modal', async ({ page }) => {
    const id = await createDeadlineAssignment();
    await uiLoginAs(page, 'teacher');
    const dl = new AssignmentDeadlinesPage(page, id);
    await dl.goto();
    await dl.openAddModal();
    await expect(dl.userIdInput()).toBeVisible();
    await expect(dl.reasonInput()).toBeVisible();
    await expect(dl.submitButton()).toBeVisible();
  });

  test('teacher creates extension for student2 and sees it in the list', async ({ page }) => {
    const id = await createDeadlineAssignment();
    const studentId = await fetchStudentId('student2');
    await uiLoginAs(page, 'teacher');
    const dl = new AssignmentDeadlinesPage(page, id);
    await dl.goto();
    await dl.openAddModal();
    await dl.createExtension(studentId, 'sick leave');
    await dl.expectExtensionRowsCount(1);
  });

  test('cancel modal does not create extension', async ({ page }) => {
    const id = await createDeadlineAssignment();
    await uiLoginAs(page, 'teacher');
    const dl = new AssignmentDeadlinesPage(page, id);
    await dl.goto();
    await dl.openAddModal();
    await dl.cancelButton().click();
    await expect(page.locator('body')).toContainText(/нет продлений|empty|пусто/i);
  });

  test('extensions are listed via API after creation', async () => {
    const api = await getApiClient('teacher');
    try {
      const course = await resolveDemoCourse(api);
      const slug = uniqueSlug('dl-api');
      const create = await api.post(`/courses/${course.id}/assignments`, {
        slug,
        title: `dl-api ${slug}`,
        description: '',
        max_score: 10,
        weight: 1,
        deadline_soft_at: new Date(Date.now() + 86400_000).toISOString(),
        deadline_hard_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
      });
      const a = await create.json();

      // Add extension via API
      const studentId = await fetchStudentId('student3');
      const ext = await api.post(`/assignments/${a.id}/deadline-extensions`, {
        user_id: studentId,
        deadline_soft_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
        deadline_hard_at: new Date(Date.now() + 21 * 86400_000).toISOString(),
        reason: 'test extension',
      });
      expect(ext.ok()).toBeTruthy();

      const list = await api.get(`/assignments/${a.id}/deadline-extensions`);
      const body = await list.json();
      const items = Array.isArray(body) ? body : body.data ?? [];
      expect(items.length).toBeGreaterThanOrEqual(1);
    } finally {
      await api.dispose();
    }
  });

  test('student2 sees deadline display on assignment detail (no error)', async ({ page }) => {
    const id = await createDeadlineAssignment();
    await uiLoginAs(page, 'student2');
    await page.goto(`/assignments/${id}`);
    // Should not crash; either deadlines visible or empty state.
    await expect(page.locator('body')).not.toContainText(/error|ошибка/i);
  });
});
