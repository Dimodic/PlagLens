/**
 * Lifecycle: draft → publish → archived.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG, resolveDemoCourse } from '../../helpers/domain';
import { uniqueSlug } from '../../helpers/factories';
import { AssignmentDetailPage } from '../../pages/assignments/AssignmentDetailPage';

async function createDraft(): Promise<string> {
  const api = await getApiClient('teacher');
  try {
    const course = await resolveDemoCourse(api);
    const slug = uniqueSlug('lifecycle');
    const r = await api.post(`/courses/${course.id}/assignments`, {
      slug,
      title: `Lifecycle ${slug}`,
      description: 'lifecycle tests',
      max_score: 10,
      weight: 1,
    });
    const a = await r.json();
    return a.id as string;
  } finally {
    await api.dispose();
  }
}

test.describe('Assignment publish / archive', () => {
  test('newly created assignment has draft status', async ({ page }) => {
    const id = await createDraft();
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await detail.expectStatus('draft');
  });

  test('teacher sees Publish button on draft assignment', async ({ page }) => {
    const id = await createDraft();
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await expect(detail.publishButton()).toBeVisible();
  });

  test('teacher publishes a draft and status changes', async ({ page }) => {
    const id = await createDraft();
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await detail.clickPublish();
    await expect.poll(async () => detail.statusBadge().textContent(), { timeout: 10000 }).toMatch(
      /опубликован/i,
    );
  });

  test('after publish — Publish button is hidden', async ({ page }) => {
    const id = await createDraft();
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/assignments/${id}:publish`);
      expect(r.ok()).toBeTruthy();
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await expect(detail.publishButton()).toHaveCount(0);
  });

  test('student does not see draft assignments in API my-assignments', async () => {
    const id = await createDraft();
    const api = await getApiClient('student1');
    try {
      const r = await api.get('/users/me/assignments?limit=200');
      if (r.ok()) {
        const data = await r.json();
        const found = data.data?.some((a: { id: string }) => a.id === id);
        expect(found).toBeFalsy();
      }
    } finally {
      await api.dispose();
    }
  });

  test('teacher archives a published assignment', async ({ page }) => {
    const id = await createDraft();
    const api = await getApiClient('teacher');
    try {
      await api.post(`/assignments/${id}:publish`);
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await detail.clickArchive();
    await expect.poll(async () => detail.statusBadge().textContent(), { timeout: 10000 }).toMatch(
      /архив/i,
    );
  });

  test('archived assignment has archived status badge', async ({ page }) => {
    const id = await createDraft();
    const api = await getApiClient('teacher');
    try {
      await api.post(`/assignments/${id}:publish`);
      await api.post(`/assignments/${id}:archive`);
    } finally {
      await api.dispose();
    }
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await detail.expectStatus('archived');
  });
});
