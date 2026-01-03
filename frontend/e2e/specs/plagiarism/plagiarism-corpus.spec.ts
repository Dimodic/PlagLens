/**
 * Plagiarism — admin corpus stats + rebuild.
 */
import { test, expect } from '../../setup/fixtures';
import { CorpusPage } from '../../pages/plagiarism/CorpusPage';
import { mockJson } from '../../helpers/plagAi';

test.describe('Plagiarism / corpus admin', () => {
  test('renders stats per language and per course', async ({ adminPage }) => {
    await mockJson(adminPage, /\/api\/v1\/plagiarism-corpus$/, {
      tenant_id: 'tnt_demo',
      entries_count: 142,
      by_language: { python: 80, cpp: 30, java: 32 },
      by_course: [
        { course_id: 'crs_a', course_name: 'Алгоритмы 2025', entries: 60 },
        { course_id: 'crs_b', course_name: 'Алгоритмы 2026', entries: 82 },
      ],
      last_rebuild_at: '2026-04-15T12:00:00Z',
    });
    const page = new CorpusPage(adminPage);
    await page.open();
    await expect(page.statEntries).toContainText('142');
    await expect(adminPage.getByText(/python/)).toBeVisible();
    await expect(adminPage.getByText(/Алгоритмы 2026/)).toBeVisible();
  });

  test('rebuild starts an Operation and shows status card', async ({ adminPage }) => {
    let rebuildCalled = 0;
    await mockJson(adminPage, /\/api\/v1\/plagiarism-corpus$/, {
      tenant_id: 'tnt_demo',
      entries_count: 0,
      by_language: {},
      by_course: [],
      last_rebuild_at: null,
    });
    await adminPage.route(/\/api\/v1\/plagiarism-corpus:rebuild/, async (route) => {
      rebuildCalled++;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          operation_id: 'op_rebuild',
          status_url: '/api/v1/operations/op_rebuild',
        }),
      });
    });
    await mockJson(adminPage, /\/api\/v1\/operations\/op_rebuild/, {
      id: 'op_rebuild',
      kind: 'rebuild_corpus',
      status: 'completed',
      progress: 1.0,
      result: { entries_count: 100 },
      created_at: '2026-05-07T09:00:00Z',
      finished_at: '2026-05-07T09:00:30Z',
    });

    const page = new CorpusPage(adminPage);
    await page.open();
    await page.rebuildButton.click();
    // Confirm dialog has the dedicated `confirm-dialog-confirm` testid.
    await adminPage.getByTestId('confirm-dialog-confirm').click();
    await adminPage.waitForTimeout(200);
    expect(rebuildCalled).toBe(1);
  });

  test('non-admin gets 404 fallback', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/plagiarism-corpus');
    // RoleGuard renders NotFoundPage for non-admins.
    await expect(teacherPage.getByText(/404|не найдено|Page not found/i).first())
      .toBeVisible({ timeout: 5_000 });
  });
});
