/**
 * Plagiarism — student-facing restrictions.
 *
 * Per the privacy spec (08-PLAGIARISM.md, F-rules and SPEC P5): the student
 * MUST NOT see pairs, fragments, or other students' code. They are limited to
 * a similarity percentage on their own submission, and even that is gated on
 * teacher approval.
 */
import { test, expect } from '../../setup/fixtures';

test.describe('Plagiarism / student access', () => {
  test('student cannot open the runs list (RoleGuard 404)', async ({ studentPage }) => {
    await studentPage.goto('/assignments/asg_demo/plagiarism');
    await expect(
      studentPage.getByText(/404|не найдено|Page not found/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('student cannot open run detail page', async ({ studentPage }) => {
    await studentPage.goto('/plagiarism-runs/run_x');
    await expect(
      studentPage.getByText(/404|не найдено|Page not found/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('student cannot open pair diff', async ({ studentPage }) => {
    await studentPage.goto('/plagiarism-runs/run_x/pairs/pair_x');
    await expect(
      studentPage.getByText(/404|не найдено|Page not found/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('student cannot open suspicious-submissions table', async ({ studentPage }) => {
    await studentPage.goto('/courses/algorithms-2026/suspicious');
    await expect(
      studentPage.getByText(/404|не найдено|Page not found/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('student cannot open admin corpus page', async ({ studentPage }) => {
    await studentPage.goto('/admin/plagiarism-corpus');
    await expect(
      studentPage.getByText(/404|не найдено|Page not found/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('student-facing UI never includes a teacher pair-row test-id', async ({
    studentPage,
  }) => {
    // Visit the student dashboard and assert no plagiarism-pair UI is exposed.
    await studentPage.goto('/me');
    await expect(
      studentPage.locator('[data-testid^="pair-row-"]'),
    ).toHaveCount(0);
    await expect(
      studentPage.locator('[data-testid^="plagiarism-run-row-"]'),
    ).toHaveCount(0);
  });
});
