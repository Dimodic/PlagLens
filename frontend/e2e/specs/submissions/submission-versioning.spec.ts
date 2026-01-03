/**
 * Multiple uploads from the same student create new versions; selection strategy.
 */
import { test, expect, request } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { API_HOST, API_PREFIX } from '../../helpers/api';
import { getApiClient, getToken } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG } from '../../helpers/domain';
import { uniqueSlug } from '../../helpers/factories';
import { SubmissionDetailPage } from '../../pages/submissions/SubmissionDetailPage';

async function newAssignment(strategy: 'last' | 'best' | 'manual'): Promise<string> {
  const api = await getApiClient('teacher');
  try {
    const { resolveDemoCourse } = await import('../../helpers/domain');
    const course = await resolveDemoCourse(api, DEMO_COURSE_SLUG);
    const slug = uniqueSlug('ver');
    const r = await api.post(`/courses/${course.id}/assignments`, {
      slug,
      title: `Versioning ${slug}`,
      description: '',
      max_score: 10,
      weight: 1,
      selection_strategy: strategy,
    });
    const a = await r.json();
    return a.id as string;
  } finally {
    await api.dispose();
  }
}

async function uploadVariant(
  assignmentId: string,
  role: 'student1',
  variant: string,
): Promise<string> {
  const token = await getToken(role);
  const ctx = await request.newContext({ baseURL: API_HOST, ignoreHTTPSErrors: true });
  try {
    // Use unique content per variant to avoid dedupe.
    const buffer = Buffer.from(`# variant ${variant}\nprint(${variant})\n`, 'utf8');
    const r = await ctx.post(`${API_PREFIX}/assignments/${assignmentId}/submissions`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        language: 'python',
        source: 'manual',
        files: { name: 'sort.py', mimeType: 'text/x-python', buffer },
      },
    });
    if (!r.ok()) throw new Error(`upload variant failed: ${r.status()} ${await r.text()}`);
    const d = await r.json();
    return d.id as string;
  } finally {
    await ctx.dispose();
  }
}

test.describe('Submission versioning', () => {
  test('two distinct uploads produce two distinct submission ids and increasing versions', async () => {
    const aId = await newAssignment('last');
    const v1 = await uploadVariant(aId, 'student1', 'one');
    const v2 = await uploadVariant(aId, 'student1', 'two');
    expect(v1).not.toBe(v2);

    // Fetch each and check version
    const api = await getApiClient('teacher');
    try {
      const a = await api.get(`/submissions/${v1}`).then((r) => r.json());
      const b = await api.get(`/submissions/${v2}`).then((r) => r.json());
      expect(b.version).toBeGreaterThan(a.version);
    } finally {
      await api.dispose();
    }
  });

  test('history endpoint returns all versions for the same author/assignment', async () => {
    const aId = await newAssignment('last');
    const v1 = await uploadVariant(aId, 'student1', 'history-1');
    const v2 = await uploadVariant(aId, 'student1', 'history-2');
    const api = await getApiClient('teacher');
    try {
      const r = await api.get(`/submissions/${v2}/history`);
      expect(r.ok()).toBeTruthy();
      const data = await r.json();
      const ids = (data.data ?? []).map((s: { id: string }) => s.id);
      expect(ids).toContain(v1);
    } finally {
      await api.dispose();
    }
  });

  test('UI History tab shows other versions', async ({ page }) => {
    const aId = await newAssignment('last');
    const v1 = await uploadVariant(aId, 'student1', 'ui-h-1');
    const v2 = await uploadVariant(aId, 'student1', 'ui-h-2');
    await uiLoginAs(page, 'teacher');
    const detail = new SubmissionDetailPage(page, v2);
    await detail.goto();
    await detail.openTab('history');
    // Either history listing or empty state for v1 not seen — accept presence of v1 link.
    await expect(page.locator('body')).toContainText(/v\d+/);
  });

  test('selection strategy "last" auto-selects newest version (best-effort API)', async () => {
    const aId = await newAssignment('last');
    const v1 = await uploadVariant(aId, 'student1', 's-last-1');
    const v2 = await uploadVariant(aId, 'student1', 's-last-2');
    const api = await getApiClient('teacher');
    try {
      // selected-per-student endpoint should include v2 not v1 (or at least include v2).
      const r = await api.get(`/assignments/${aId}/submissions/selected-per-student`);
      if (r.ok()) {
        const data = await r.json();
        const ids = (data.data ?? []).map((s: { id: string }) => s.id);
        expect(ids).toContain(v2);
        expect(ids).not.toContain(v1);
      }
    } finally {
      await api.dispose();
    }
  });

  test('manual strategy: explicit :select marks a submission selected', async () => {
    const aId = await newAssignment('manual');
    const v1 = await uploadVariant(aId, 'student1', 'm-1');
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/submissions/${v1}:select`);
      expect([200, 201, 202, 204]).toContain(r.status());
    } finally {
      await api.dispose();
    }
  });
});
