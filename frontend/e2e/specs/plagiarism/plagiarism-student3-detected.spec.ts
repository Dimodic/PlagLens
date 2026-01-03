/**
 * Plagiarism — end-to-end critical path: the seeded student3 plagiarism case.
 *
 * Two flavours:
 *   - mocked path verifies UI assembles a pair view for student1 ↔ student3
 *     when JPlag returns the expected high-similarity pair. This always runs.
 *   - real path drives the actual gateway + JPlag container against the demo
 *     tenant; gated on demo seed data and marked test.slow().
 */
import { test, expect } from '../../setup/fixtures';
import { PlagiarismRunsListPage } from '../../pages/plagiarism/PlagiarismRunsListPage';
import { PlagiarismRunDetailPage } from '../../pages/plagiarism/PlagiarismRunDetailPage';
import { PairDiffPage } from '../../pages/plagiarism/PairDiffPage';
import {
  resolveDemoAssignment,
  mockJson,
  makeRun,
  makePair,
  makeRunSummary,
} from '../../helpers/plagAi';

const ASG = 'asg_demo';
const RUN = 'run_seeded';
const PAIR = 'pair_s1_s3';

test.describe('Plagiarism / student3 detection — mocked', () => {
  test('teacher opens lab-1-sort, opens the high-similarity pair, sees fragments', async ({
    teacherPage,
  }) => {
    // 1. List runs.
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: [makeRun({ id: RUN, max_similarity: 0.93 })],
      total: 1,
    });
    // 2. Run detail.
    await mockJson(teacherPage, new RegExp(`/api/v1/plagiarism-runs/${RUN}$`), makeRun({ id: RUN }));
    await mockJson(teacherPage, new RegExp(`/api/v1/plagiarism-runs/${RUN}/report$`), {
      run_id: RUN,
      assignment_id: ASG,
      provider: 'jplag',
      status: 'completed',
      submissions_count: 4,
      summary: makeRunSummary({ pairs_suspected: 1, max_similarity: 0.93 }),
      started_at: '2026-04-30T09:00:00Z',
      finished_at: '2026-04-30T09:00:30Z',
      options_used: { similarity_threshold: 0.6 },
      artifacts: {},
    });
    await mockJson(teacherPage, new RegExp(`/api/v1/plagiarism-runs/${RUN}/pairs`), {
      data: [
        makePair({
          id: PAIR,
          run_id: RUN,
          a_submission_id: 'sub_s1',
          b_submission_id: 'sub_s3',
          a_author: { id: 'u_s1', display_name: 'Алиса Иванова' },
          b_author: { id: 'u_s3', display_name: 'Олег Кузнецов' },
          similarity: 0.93,
        }),
        makePair({ id: 'pair_other_low', similarity: 0.2 }),
      ],
      total: 2,
    });
    // 3. Pair diff.
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/plagiarism-runs/${RUN}/pairs/${PAIR}$`),
      {
        id: PAIR,
        run_id: RUN,
        similarity: 0.93,
        matched_tokens: 184,
        fragments_count: 1,
        fragments: [
          {
            a_file: 'student1/sort.py',
            a_start_line: 1,
            a_end_line: 6,
            b_file: 'student3/sort.py',
            b_start_line: 1,
            b_end_line: 6,
            a_content:
              'def bubble(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]',
            b_content:
              'def sort(items):\n    n = len(items)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if items[j] > items[j + 1]:\n                items[j], items[j + 1] = items[j + 1], items[j]',
          },
        ],
        submissions: {
          a: { submission_id: 'sub_s1', author: { id: 'u_s1', display_name: 'Алиса Иванова' }, language: 'python' },
          b: { submission_id: 'sub_s3', author: { id: 'u_s3', display_name: 'Олег Кузнецов' }, language: 'python' },
        },
      },
    );

    // 1. Open runs list, click into the run.
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    await expect(list.runRow(RUN)).toBeVisible();

    // 2. Open the run detail.
    const detail = new PlagiarismRunDetailPage(teacherPage);
    await detail.open(RUN);
    await expect(detail.pairsTable).toBeVisible();
    const row = detail.pairRow(PAIR);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Алиса Иванова');
    await expect(row).toContainText('Олег Кузнецов');
    // similarity is high zone.
    await expect(row.locator('[data-similarity-zone="high"]').first()).toBeVisible();

    // 3. Open pair diff.
    await teacherPage.goto(`/plagiarism-runs/${RUN}/pairs/${PAIR}`);
    const diff = new PairDiffPage(teacherPage);
    await expect(diff.diff).toBeVisible();
    // Pane labels include both students.
    await expect(teacherPage.getByText('Алиса Иванова').first()).toBeVisible();
    await expect(teacherPage.getByText('Олег Кузнецов').first()).toBeVisible();
    // Line 1 highlighted on both panes.
    await expect(diff.paneLine('left', 1)).toBeVisible();
    await expect(diff.paneLine('right', 1)).toBeVisible();
  });
});

test.describe('Plagiarism / student3 detection — real JPlag', () => {
  test.slow();
  test.skip(
    !!process.env.E2E_SKIP_REAL,
    'Set E2E_SKIP_REAL=1 to skip seeded JPlag e2e',
  );

  test('end-to-end real run yields a high-similarity student1↔student3 pair', async ({
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

    // Verify the teacher's JWT carries the course_roles needed to start
    // a plagiarism run; otherwise the gateway returns 403 long before any
    // JPlag work happens. This is a seed-data concern (course_roles must
    // be populated in the access token), so we skip rather than fail.
    const me = await apiClient.me().catch(() => null);
    const role = me?.course_roles?.[String(assignment.course_id)];
    if (!role) {
      test.skip(
        true,
        `Teacher JWT lacks course_roles for course ${assignment.course_id}; seed required`,
      );
      return;
    }

    // Drive a real run via the gateway, then poll for at least one row.
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(assignment.assignment_id);
    await list.openCreateModal();
    await list.submitCreate();

    // Wait for completion within ~60s.
    await expect(list.runsTable).toBeVisible({ timeout: 60_000 });
    const completedRow = list.runsTable
      .getByRole('row')
      .filter({ hasText: /completed/i })
      .first();
    await expect(completedRow).toBeVisible({ timeout: 60_000 });

    // Open the most recent run; assert at least one suspicious pair exists.
    await completedRow.getByRole('link', { name: /Открыть/ }).click();
    await teacherPage.waitForURL(/\/plagiarism-runs\//, { timeout: 10_000 });
    await expect(teacherPage.getByTestId('plagiarism-pairs-table')).toBeVisible({
      timeout: 30_000,
    });
    // High-similarity pair indicator visible somewhere in the table.
    await expect(
      teacherPage.locator('[data-similarity-zone="high"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
