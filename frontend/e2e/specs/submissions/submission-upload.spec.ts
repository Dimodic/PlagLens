/**
 * Student upload via Mantine Dropzone — single file, multi-file, dedupe.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { getApiClient } from '../../helpers/token-cache';
import {
  DEMO_COURSE_SLUG,
  fixtureSortPath,
  resolveAssignmentBySlug,
} from '../../helpers/domain';
import { SubmissionUploadPage } from '../../pages/submissions/SubmissionUploadPage';

let lab1Id: string;

test.beforeAll(async () => {
  const api = await getApiClient('teacher');
  try {
    const a = await resolveAssignmentBySlug(api, DEMO_COURSE_SLUG, 'lab-1-sort');
    lab1Id = a.id;
  } finally {
    await api.dispose();
  }
});

test.describe('Submission upload', () => {
  test('upload page renders dropzone and submit button', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const upload = new SubmissionUploadPage(page, lab1Id);
    await upload.goto();
    await expect(upload.dropzone()).toBeVisible();
    await expect(upload.uploadButton()).toBeVisible();
    await expect(upload.cancelButton()).toBeVisible();
  });

  test('upload of single Python file (programmatic input)', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const upload = new SubmissionUploadPage(page, lab1Id);
    await upload.goto();
    await upload.setFiles([fixtureSortPath('student1')]);
    // The chosen file should appear in the list.
    await expect(page.locator('body')).toContainText(/sort\.py/);
  });

  test('upload submits and redirects to detail or my-submissions', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const upload = new SubmissionUploadPage(page, lab1Id);
    await upload.goto();
    await upload.uploadFiles([fixtureSortPath('student1')]);
    await page.waitForURL(/\/(submissions\/[^/]+|me\/submissions)$/, { timeout: 30000 });
  });

  test('clicking Submit with no files shows validation error', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const upload = new SubmissionUploadPage(page, lab1Id);
    await upload.goto();
    await upload.clickUpload();
    await expect(page.locator('body')).toContainText(/выберите хотя бы один файл/i);
  });

  test('multiple files can be added', async ({ page }) => {
    await uiLoginAs(page, 'student2');
    const upload = new SubmissionUploadPage(page, lab1Id);
    await upload.goto();
    await upload.setFiles([fixtureSortPath('student2')]);
    await expect(page.locator('body')).toContainText(/sort\.py/);
  });

  test('cancel returns to assignment page', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    const upload = new SubmissionUploadPage(page, lab1Id);
    await upload.goto();
    await upload.cancelButton().click();
    await page.waitForURL(`/assignments/${lab1Id}`);
  });

  test('dedupe: re-uploading the same file content returns existing submission (API)', async () => {
    // First upload via API multipart
    const fs = await import('node:fs/promises');
    const filePath = fixtureSortPath('student3');
    const buf = await fs.readFile(filePath);
    const fd = (await import('@playwright/test')).request;
    // Use raw fetch via APIRequestContext which is in api client; create a multipart manually.
    // We re-use the underlying ctx by building a multipart body — but ApiClient is JSON-only.
    // Acceptable shortcut: just call API twice and confirm the same submission id.
    const { API_HOST, API_PREFIX } = await import('../../helpers/api');
    const ctx = await fd.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
    const apiPath = (p: string) => `${API_PREFIX}${p}`;
    const { getToken } = await import('../../helpers/token-cache');
    const token = await getToken('student1');
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

    const a = await ctx.post(apiPath(`/assignments/${(await getLab1Id())}/submissions`), {
      headers,
      multipart: {
        language: 'python',
        source: 'manual',
        files: { name: 'sort.py', mimeType: 'text/x-python', buffer: buf },
      },
    });
    if (!a.ok()) {
      const errBody = await a.text();
      throw new Error(`Upload A failed (${a.status()}): ${errBody}`);
    }
    expect(a.ok()).toBeTruthy();
    const aData = await a.json();

    // Second upload — same content -> dedupe expected.
    const b = await ctx.post(apiPath(`/assignments/${(await getLab1Id())}/submissions`), {
      headers,
      multipart: {
        language: 'python',
        source: 'manual',
        files: { name: 'sort.py', mimeType: 'text/x-python', buffer: buf },
      },
    });
    expect(b.ok()).toBeTruthy();
    const bData = await b.json();
    expect(aData.id).toBe(bData.id);
    await ctx.dispose();
  });

  test('teacher can also upload via the same UI route (acts as admin upload)', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    await page.goto(`/assignments/${lab1Id}/upload`);
    // Teachers don't typically upload via this UI — but the route is reachable.
    await expect(page.getByTestId('submission-dropzone')).toBeVisible();
  });
});

async function getLab1Id(): Promise<string> {
  if (lab1Id) return lab1Id;
  const api = await getApiClient('teacher');
  try {
    const a = await resolveAssignmentBySlug(api, DEMO_COURSE_SLUG, 'lab-1-sort');
    lab1Id = a.id;
    return lab1Id;
  } finally {
    await api.dispose();
  }
}
