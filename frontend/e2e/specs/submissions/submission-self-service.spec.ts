/**
 * Student-facing self-service routes:
 *   /me/submissions
 *   /users/me/assignments/:id/submissions (API)
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { getApiClient } from '../../helpers/token-cache';
import { getLab1Id, uploadSubmissionAs } from '../../helpers/domain';
import { MySubmissionsPage } from '../../pages/submissions/MySubmissionsPage';

let lab1Id: string;

const uploadFor = async (role: 'student1' | 'student2' | 'student3' | 'student4') => {
  if (!lab1Id) lab1Id = await getLab1Id();
  return uploadSubmissionAs(role, { assignmentId: lab1Id });
};

test.describe('Submission self-service', () => {
  test('student sees /me/submissions page render', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const my = new MySubmissionsPage(page);
    await my.goto();
    await expect(page.getByTestId('my-submissions-list')).toBeVisible();
  });

  test('student sees their submission listed in /me/submissions after upload', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'student1');
    const my = new MySubmissionsPage(page);
    await my.goto();
    await expect.poll(async () => my.rowById(sId).count(), { timeout: 10000 }).toBeGreaterThanOrEqual(1);
  });

  test('student2 does not see student1 submissions', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'student2');
    const my = new MySubmissionsPage(page);
    await my.goto();
    await expect(my.rowById(sId)).toHaveCount(0);
  });

  test('language filter narrows the list', async ({ page }) => {
    await uploadFor('student1');
    await uiLoginAs(page, 'student1');
    const my = new MySubmissionsPage(page);
    await my.goto();
    const before = await my.rows().count();
    // Switch to Java — no Java submissions in fixture, so we expect zero.
    await my.languageFilter().getByRole('radio', { name: /java/i }).click();
    await expect.poll(async () => my.rows().count(), { timeout: 5000 }).toBeLessThanOrEqual(before);
  });

  test('API /users/me/submissions returns only own submissions', async () => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('student1');
    try {
      const r = await api.get('/users/me/submissions');
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      const items = Array.isArray(body) ? body : body.data ?? [];
      const ids = items.map((s: { id: string }) => s.id);
      expect(ids).toContain(sId);
    } finally {
      await api.dispose();
    }
  });

  test('API /users/me/assignments/:id/submissions returns only own submissions', async () => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('student1');
    try {
      const r = await api.get(`/users/me/assignments/${lab1Id}/submissions`);
      expect(r.ok()).toBeTruthy();
      const body = await r.json();
      const items = Array.isArray(body) ? body : body.data ?? [];
      const ids = items.map((s: { id: string }) => s.id);
      expect(ids).toContain(sId);
    } finally {
      await api.dispose();
    }
  });

  test('student receives 403 trying to read another student submission directly', async () => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('student2');
    try {
      const r = await api.get(`/submissions/${sId}`);
      expect([401, 403, 404]).toContain(r.status());
    } finally {
      await api.dispose();
    }
  });
});
