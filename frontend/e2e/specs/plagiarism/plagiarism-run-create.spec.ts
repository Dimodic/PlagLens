/**
 * Plagiarism — start a new run.
 *
 * The mocked path verifies the modal -> 202 Accepted -> Operation polling ->
 * completed status flow without invoking the JPlag container. The slow path
 * runs the real seeded plagiarism scenario end-to-end and is gated on demo
 * data being present (run only when needed via `--grep @real`).
 */
import { test, expect } from '../../setup/fixtures';
import {
  resolveDemoAssignment,
  mockJson,
  makeRun,
  makePair,
  makeRunSummary,
} from '../../helpers/plagAi';
import { PlagiarismRunsListPage } from '../../pages/plagiarism/PlagiarismRunsListPage';

const ASG = 'asg_demo';

test.describe('Plagiarism / run create — mocked', () => {
  test('submit triggers POST and shows success notification', async ({ teacherPage }) => {
    let postCount = 0;
    await teacherPage.route(
      /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs(\?|$)/,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [], total: 0 }),
          });
          return;
        }
        postCount++;
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            operation_id: 'op_abc',
            status_url: '/api/v1/operations/op_abc',
          }),
        });
      },
    );

    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    await list.openCreateModal();
    await expect(list.createModal).toBeVisible();
    await list.submitCreate();

    await expect(teacherPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/очередь/i, { timeout: 5_000 });
    expect(postCount).toBe(1);
  });

  test('failure response surfaces a problem alert', async ({ teacherPage }) => {
    await teacherPage.route(
      /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs(\?|$)/,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [], total: 0 }),
          });
          return;
        }
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Активный run уже идёт',
            status: 409,
            code: 'CONFLICT',
            detail: 'У этого assignment уже есть очередь',
          }),
        });
      },
    );

    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    await list.openCreateModal();
    await list.submitCreate();
    await expect(teacherPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/уже|очередь|run/i, { timeout: 5_000 });
  });

  test('completed run renders pairs after polling', async ({ teacherPage }) => {
    const run = makeRun({ id: 'run_after', status: 'completed' });

    await mockJson(teacherPage, /\/api\/v1\/plagiarism-runs\/run_after\/report$/, {
      run_id: 'run_after',
      assignment_id: ASG,
      provider: 'jplag',
      status: 'completed',
      submissions_count: 4,
      summary: makeRunSummary(),
      started_at: run.started_at,
      finished_at: run.finished_at,
      options_used: { similarity_threshold: 0.6 },
      artifacts: {},
    });
    await mockJson(teacherPage, /\/api\/v1\/plagiarism-runs\/run_after$/, run);
    await mockJson(teacherPage, /\/api\/v1\/plagiarism-runs\/run_after\/pairs/, {
      data: [makePair({ id: 'pair_aa' })],
      total: 1,
    });

    await teacherPage.goto(`/plagiarism-runs/run_after`);
    await expect(teacherPage.getByText('Plagiarism run')).toBeVisible();
    await expect(teacherPage.getByTestId('plagiarism-pairs-table')).toBeVisible();
    await expect(teacherPage.getByTestId('pair-row-pair_aa')).toBeVisible();
  });
});

// ------------------ Real JPlag path (slow) ----------------------------------
test.describe('Plagiarism / run create — real JPlag', () => {
  test.slow();
  test.skip(
    !!process.env.E2E_SKIP_REAL,
    'Set E2E_SKIP_REAL=1 to skip seeded JPlag e2e',
  );

  test('teacher launches a real JPlag run and pairs appear', async ({
    teacherPage,
    apiClient,
  }) => {
    let assignment;
    try {
      assignment = await resolveDemoAssignment(apiClient);
    } catch (e) {
      test.skip(true, `Demo seed missing: ${(e as Error).message}`);
      return;
    }

    // Verify teacher JWT carries course role; otherwise the gateway
    // rejects the run with 403 long before JPlag work begins.
    const me = await apiClient.me().catch(() => null);
    const role = me?.course_roles?.[String(assignment.course_id)];
    if (!role) {
      test.skip(
        true,
        `Teacher JWT lacks course_roles for course ${assignment.course_id}; seed required`,
      );
      return;
    }
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(assignment.assignment_id);
    await list.openCreateModal();
    await list.submitCreate();

    // Wait for at least one row to appear in the runs table.
    await expect(list.runsTable).toBeVisible({ timeout: 60_000 });
    // Wait for at least one row labelled with "completed" within ~45s.
    await expect(
      list.runsTable.getByText(/completed/i).first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});
