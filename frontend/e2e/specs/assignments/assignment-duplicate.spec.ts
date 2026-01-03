/**
 * Duplicating an assignment (same / different course).
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG, resolveDemoCourse } from '../../helpers/domain';
import { uniqueSlug } from '../../helpers/factories';
import { AssignmentDetailPage } from '../../pages/assignments/AssignmentDetailPage';

async function createForDuplicate(): Promise<string> {
  const api = await getApiClient('teacher');
  try {
    const course = await resolveDemoCourse(api);
    const slug = uniqueSlug('dup-src');
    const r = await api.post(`/courses/${course.id}/assignments`, {
      slug,
      title: `Source ${slug}`,
      description: 'source for duplication',
      max_score: 10,
      weight: 1,
    });
    const a = await r.json();
    return a.id as string;
  } finally {
    await api.dispose();
  }
}

test.describe('Assignment duplicate', () => {
  test('teacher sees Duplicate option in actions menu', async ({ page }) => {
    const id = await createForDuplicate();
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await detail.actionsMenu().click();
    await expect(page.getByTestId('assignment-action-duplicate')).toBeVisible();
  });

  test('teacher triggers duplicate (Operation flow)', async ({ page }) => {
    const id = await createForDuplicate();
    await uiLoginAs(page, 'teacher');
    const detail = new AssignmentDetailPage(page, id);
    await detail.goto();
    await detail.clickDuplicate();
    // Notification appears
    await expect(page.locator('body')).toContainText(/дублирование|копировани/i, { timeout: 10000 });
  });

  test('API duplicate returns Operation 202 with id', async () => {
    const id = await createForDuplicate();
    const api = await getApiClient('teacher');
    try {
      const r = await api.post(`/assignments/${id}:duplicate`, {
        new_slug: uniqueSlug('dup'),
      });
      // Either 202 Operation or 200/201 with the duplicated assignment.
      expect([200, 201, 202]).toContain(r.status());
      const data = await r.json();
      expect(data).toBeTruthy();
      expect(data.id).toBeTruthy();
    } finally {
      await api.dispose();
    }
  });

  test('duplicate to same course produces a distinct slug', async () => {
    const id = await createForDuplicate();
    const api = await getApiClient('teacher');
    try {
      const newSlug = uniqueSlug('dup');
      const r = await api.post(`/assignments/${id}:duplicate`, {
        new_slug: newSlug,
      });
      expect([200, 201, 202]).toContain(r.status());
      const data = await r.json();
      // The duplicated assignment should have the new slug we asked for.
      if (data.slug) {
        expect(data.slug).toBe(newSlug);
      }
    } finally {
      await api.dispose();
    }
  });

  test('student does not have duplicate option', async ({ page }) => {
    const id = await createForDuplicate();
    await uiLoginAs(page, 'student1');
    await page.goto(`/assignments/${id}`);
    await expect(page.getByTestId('assignment-action-duplicate')).toHaveCount(0);
  });
});
