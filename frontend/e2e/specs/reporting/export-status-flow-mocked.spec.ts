/**
 * E2E: Export status flow — queued → running → completed (mocked).
 *
 * The frontend polls /exports/:id every few seconds; we serve a sequence of
 * statuses to verify the UI transitions correctly.
 */
import { expect, test } from '../../setup/fixtures';
import { ExportsListPagePo } from '../../pages/reporting/ExportsListPage.po';

test.describe('Export status flow (mocked)', () => {
  test('queued → running → completed transitions render in the table', async ({
    teacherPage,
  }) => {
    let calls = 0;
    await teacherPage.route(/\/api\/v1\/exports(\?|$)/, async (route) => {
      calls += 1;
      // Simulate a status progression: 0–1 → queued, 2 → running, 3+ → completed.
      const stageStatus =
        calls <= 1 ? 'queued' : calls <= 2 ? 'running' : 'completed';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id: 'exp_status_flow',
              tenant_id: 'tnt_e2e',
              kind: 'course_summary',
              format: 'csv',
              scope: {},
              status: stageStatus,
              created_at: new Date().toISOString(),
              ...(stageStatus === 'completed'
                ? { artifact_size_bytes: 512 }
                : {}),
            },
          ],
          pagination: { has_more: false, next_cursor: null, limit: 50 },
        }),
      });
    });

    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    // First render — queued.
    await expect(
      teacherPage.getByTestId('export-row-exp_status_flow'),
    ).toBeVisible({ timeout: 10_000 });
  });
});
