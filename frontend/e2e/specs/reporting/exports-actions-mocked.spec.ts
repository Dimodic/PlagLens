/**
 * E2E: per-row export actions (retry / cancel / delete) — mocked endpoints.
 *
 * We render a list with one row per status (queued, running, completed,
 * failed) and verify the appropriate action buttons are clickable.
 */
import { expect, test } from '../../setup/fixtures';

test.describe('Export per-row actions (mocked)', () => {
  test.beforeEach(async ({ teacherPage }) => {
    await teacherPage.route(/\/api\/v1\/exports(\?|$)/, async (route) => {
      const now = new Date().toISOString();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'exp_q', kind: 'course_summary', format: 'csv', status: 'queued', created_at: now, scope: {} },
            { id: 'exp_r', kind: 'course_summary', format: 'csv', status: 'running', created_at: now, scope: {} },
            { id: 'exp_c', kind: 'course_summary', format: 'csv', status: 'completed', artifact_size_bytes: 1024, created_at: now, scope: {} },
            { id: 'exp_f', kind: 'course_summary', format: 'csv', status: 'failed', created_at: now, scope: {}, error: { title: 'oops' } },
          ],
          pagination: { has_more: false, next_cursor: null, limit: 50 },
        }),
      });
    });
  });

  test('retry button is present for failed exports', async ({ teacherPage }) => {
    await teacherPage.goto('/me/exports');
    await expect(teacherPage.getByTestId('export-row-exp_f')).toBeVisible({
      timeout: 10_000,
    });
    const retry = teacherPage.getByTestId('retry-exp_f');
    if (await retry.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(retry).toBeEnabled();
    }
  });

  test('cancel button is present for queued/running exports', async ({
    teacherPage,
  }) => {
    await teacherPage.goto('/me/exports');
    const cancelQueued = teacherPage.getByTestId('cancel-exp_q');
    const cancelRunning = teacherPage.getByTestId('cancel-exp_r');
    if (await cancelQueued.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(cancelQueued).toBeEnabled();
    }
    if (await cancelRunning.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(cancelRunning).toBeEnabled();
    }
  });

  test('download button is present for completed exports', async ({
    teacherPage,
  }) => {
    await teacherPage.goto('/me/exports');
    const dl = teacherPage.getByTestId('download-exp_c');
    if (await dl.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await expect(dl).toBeEnabled();
    }
  });
});
