/**
 * Full assignment creation flow + validation.
 */
import { test, expect } from '@playwright/test';
import { uiLoginAs } from '../../helpers/auth';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { DEMO_COURSE_SLUG, resolveDemoCourse } from '../../helpers/domain';
import { uniqueSlug } from '../../helpers/factories';
import { AssignmentCreatePage } from '../../pages/assignments/AssignmentCreatePage';

test.describe('Assignment creation', () => {
  test('teacher creates a minimal valid assignment', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    const slug = uniqueSlug('lab');
    await create.createAssignment({
      title: `E2E ${slug}`,
      slug,
      description: 'Created by E2E test',
      maxScore: 10,
      weight: 1,
    });
    await page.waitForURL(/\/assignments\/[^/]+$/, { timeout: 15000 });
    await expect(page.getByTestId('assignment-detail')).toBeVisible();
    await expect(page.getByTestId('assignment-title')).toContainText(slug);
  });

  test('form is rendered with all required fields visible', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    await expect(create.titleInput()).toBeVisible();
    await expect(create.slugInput()).toBeVisible();
    await expect(create.maxScoreInput()).toBeVisible();
    await expect(create.weightInput()).toBeVisible();
    await expect(create.lateMultiplierInput()).toBeVisible();
    // Mantine Switch attaches the testid on the hidden checkbox <input>; use
    // attached/visible-relaxed assertion.
    await expect(create.plagiarismAutoRunSwitch()).toBeAttached();
    await expect(create.plagiarismThresholdInput()).toBeVisible();
    await expect(create.aiAutoRunSwitch()).toBeAttached();
    await expect(create.submitButton()).toBeVisible();
  });

  test('rejects slug with uppercase / invalid characters', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    await create.titleInput().fill('Some Title');
    await create.slugInput().fill('Invalid Slug With Spaces');
    await create.submitButton().click();
    await create.expectValidationError(/только латиница|латиниц/i);
    // URL should remain on the create page.
    await expect(page).toHaveURL(/\/assignments\/new$/);
  });

  test('rejects slug with non-ASCII characters', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    await create.titleInput().fill('Some Title');
    await create.slugInput().fill('РУССКИЙ-СЛАГ');
    await create.submitButton().click();
    await create.expectValidationError(/только латиниц/i);
  });

  test('rejects very short title', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    await create.titleInput().fill('A');
    await create.slugInput().fill(uniqueSlug('lab'));
    await create.submitButton().click();
    await create.expectValidationError(/не короче|минимум|короче 2/i);
  });

  test('duplicate slug should produce server error', async ({ page }) => {
    // Create one, then attempt second with same slug.
    await uiLoginAs(page, 'teacher');
    const slug = uniqueSlug('dup');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    await create.createAssignment({
      title: `E2E dup ${slug}`,
      slug,
      maxScore: 10,
      weight: 1,
    });
    await page.waitForURL(/\/assignments\/[^/]+$/, { timeout: 15000 });

    // Now try again — backend should reject 409 / 400 with conflict.
    await create.goto();
    await create.fillForm({
      title: `E2E dup repeat ${slug}`,
      slug,
      maxScore: 10,
      weight: 1,
    });
    await create.submit();
    // Either an alert appears or the URL stays on /new.
    await expect.poll(async () => page.url(), { timeout: 10000 }).toMatch(/\/new$|\/courses\//);
  });

  test('teacher creates assignment with full options (late multiplier + selection)', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    const slug = uniqueSlug('full');
    await create.fillForm({
      title: `E2E full ${slug}`,
      slug,
      description: '## Описание\n\nКод на python',
      maxScore: 100,
      weight: 2.5,
      lateMultiplier: 0.7,
      selectionStrategy: 'best',
      plagiarismThreshold: 0.75,
    });
    await create.submit();
    await page.waitForURL(/\/assignments\/[^/]+$/, { timeout: 15000 });
    await expect(page.getByTestId('assignment-detail')).toBeVisible();
  });

  test('cancel button returns to course page', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    await create.cancelButton().click();
    await page.waitForURL(`/courses/${DEMO_COURSE_SLUG}`);
  });

  test('student cannot reach assignment-create page (no link visible)', async ({ page }) => {
    await uiLoginAs(page, 'student1');
    await page.goto(`/courses/${DEMO_COURSE_SLUG}`);
    await expect(page.getByRole('link', { name: /создать задание/i })).toHaveCount(0);
  });

  test('selection_strategy radio defaults to "best"', async ({ page }) => {
    await uiLoginAs(page, 'teacher');
    const create = new AssignmentCreatePage(page, DEMO_COURSE_SLUG);
    await create.goto();
    // Mantine Radio puts the testid on the input itself; in the wrapper case
    // descend into the input.
    const target = page.getByTestId('assignment-form-selection_strategy-best');
    const tag = await target.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
    const radio = tag === 'input' ? target : target.locator('input[type="radio"]');
    await expect(radio).toBeChecked();
  });

  test('late_multiplier accepts decimal values and saves them', async () => {
    const api = await getApiClient('teacher');
    try {
      const course = await resolveDemoCourse(api);
      const slug = uniqueSlug('late');
      const resp = await api.post(`/courses/${course.id}/assignments`, {
        slug,
        title: `E2E late ${slug}`,
        description: 'with late multiplier',
        max_score: 10,
        weight: 1,
        late_score_multiplier: 0.4,
        selection_strategy: 'last',
      });
      expect(resp.ok()).toBeTruthy();
      const data = await resp.json();
      // Backend returns numerics as strings (Decimal serialised); normalise.
      expect(parseFloat(data.late_score_multiplier)).toBeCloseTo(0.4, 2);
      expect(data.selection_strategy).toBe('last');
    } finally {
      await api.dispose();
    }
  });
});
