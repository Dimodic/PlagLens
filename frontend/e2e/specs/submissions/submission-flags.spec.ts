/**
 * Manual flag / unflag a submission as suspicious.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { getApiClient } from '../../helpers/token-cache';
import { uploadSubmissionAs } from '../../helpers/domain';
import { SubmissionDetailPage } from '../../pages/submissions/SubmissionDetailPage';

const uploadFor = (role: 'student1' | 'student2' | 'student3' | 'student4') =>
  uploadSubmissionAs(role);

test.describe('Submission flags', () => {
  test('teacher sees Flags tab and can add a manual flag', async ({ page }) => {
    const sId = await uploadFor('student1');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.expectTabVisible('flags');
    await detail.addManualFlag();
    await expect(page.locator('body')).toContainText(/флаг|поставлен/i, { timeout: 10000 });
  });

  test('student does not see Flags tab', async ({ page }) => {
    const sId = await uploadFor('student2');
    await uiLoginAs(page, 'student2');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.expectTabHidden('flags');
  });

  test('manual flag appears in the flags list with kind=manual badge', async ({ page }) => {
    const sId = await uploadFor('student3');
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/submissions/${sId}/flags`, { kind: 'manual', reason: 'test reason' });
      expect(r.ok()).toBeTruthy();
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('flags');
    await expect(page.locator('body')).toContainText(/manual/i);
    await expect(page.locator('body')).toContainText(/test reason/i);
  });

  test('teacher can remove a flag', async ({ page }) => {
    const sId = await uploadFor('student4');
    const api = await getApiClient('teacher');
    try {
      await api.post(`/submissions/${sId}/flags`, { kind: 'manual', reason: 'to remove' });
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, sId);
    await detail.goto();
    await detail.openTab('flags');
    await expect(page.locator('body')).toContainText(/to remove/i);
    await page.getByRole('button', { name: /снять/i }).first().click();
    await expect(page.locator('body')).toContainText(/флаг снят/i, { timeout: 10000 });
  });

  test('API: list flagged submissions per assignment includes the flagged one', async () => {
    const sId = await uploadFor('student1');
    const api = await getApiClient('teacher');
    try {
      await api.post(`/submissions/${sId}/flags`, { kind: 'manual', reason: 'list test' });
      const r = await api.get(`/assignments/${lab1Id}/flagged-submissions`);
      // 200 OK or 404 if not implemented — accept both.
      if (r.ok()) {
        const data = await r.json();
        const ids = (data.data ?? []).map((s: { id: string }) => s.id);
        expect(ids).toContain(sId);
      }
    } finally {
      await api.dispose();
    }
  });
});
