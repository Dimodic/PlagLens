/**
 * Plagiarism — pair diff visualisation.
 */
import { test, expect } from '../../setup/fixtures';
import { PairDiffPage } from '../../pages/plagiarism/PairDiffPage';
import { mockJson } from '../../helpers/plagAi';

const RUN = 'run_diff';
const PAIR = 'pair_diff_001';

const FRAGMENT_1_CONTENT_A = `def bubble(arr):\n    n = len(arr)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if arr[j] > arr[j + 1]:\n                arr[j], arr[j + 1] = arr[j + 1], arr[j]`;
const FRAGMENT_1_CONTENT_B = `def sort(items):\n    n = len(items)\n    for i in range(n):\n        for j in range(0, n - i - 1):\n            if items[j] > items[j + 1]:\n                items[j], items[j + 1] = items[j + 1], items[j]`;

const FRAGMENT_2_CONTENT_A = `print(bubble([3, 1, 2]))`;
const FRAGMENT_2_CONTENT_B = `print(sort([3, 1, 2]))`;

async function arrangeDiff(page: import('@playwright/test').Page) {
  await mockJson(page, new RegExp(`/api/v1/plagiarism-runs/${RUN}/pairs/${PAIR}$`), {
    id: PAIR,
    run_id: RUN,
    similarity: 0.91,
    matched_tokens: 184,
    fragments_count: 2,
    fragments: [
      {
        a_file: 'student1/sort.py',
        a_start_line: 1,
        a_end_line: 6,
        b_file: 'student3/sort.py',
        b_start_line: 1,
        b_end_line: 6,
        a_content: FRAGMENT_1_CONTENT_A,
        b_content: FRAGMENT_1_CONTENT_B,
      },
      {
        a_file: 'student1/sort.py',
        a_start_line: 9,
        a_end_line: 9,
        b_file: 'student3/sort.py',
        b_start_line: 9,
        b_end_line: 9,
        a_content: FRAGMENT_2_CONTENT_A,
        b_content: FRAGMENT_2_CONTENT_B,
      },
    ],
    submissions: {
      a: { submission_id: 'sub_s1', author: { id: 'u1', display_name: 'Алиса' }, language: 'python' },
      b: { submission_id: 'sub_s3', author: { id: 'u3', display_name: 'Олег' }, language: 'python' },
    },
  });
}

test.describe('Plagiarism / pair diff', () => {
  test.beforeEach(async ({ teacherPage }) => {
    await arrangeDiff(teacherPage);
  });

  test('renders side-by-side panes with author labels', async ({ teacherPage }) => {
    const diff = new PairDiffPage(teacherPage);
    await diff.open(RUN, PAIR);
    await expect(diff.diff).toBeVisible();
    await expect(diff.leftPane).toBeVisible();
    await expect(diff.rightPane).toBeVisible();
    await expect(teacherPage.getByText('Алиса').first()).toBeVisible();
    await expect(teacherPage.getByText('Олег').first()).toBeVisible();
  });

  test('renders accordion entries per fragment', async ({ teacherPage }) => {
    const diff = new PairDiffPage(teacherPage);
    await diff.open(RUN, PAIR);
    await expect(diff.fragmentsAccordion).toBeVisible();
    await expect(diff.fragmentItem(0)).toBeVisible();
    await expect(diff.fragmentItem(1)).toBeVisible();
  });

  test('matched lines have a non-transparent background colour', async ({
    teacherPage,
  }) => {
    const diff = new PairDiffPage(teacherPage);
    await diff.open(RUN, PAIR);
    const lines = diff.paneLinesByFragment('left', 0);
    await expect(lines.first()).toBeVisible();
    const bg = await lines.first().evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    // Mantine zone is rgb(255,243,191)/d3f9d8/dbe4ff/etc — anything but transparent.
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
    expect(bg).not.toBe('transparent');
  });

  test('toggling fragment off removes its highlight', async ({ teacherPage }) => {
    const diff = new PairDiffPage(teacherPage);
    await diff.open(RUN, PAIR);
    // Initially highlighted.
    await expect(diff.paneLinesByFragment('left', 1).first()).toBeVisible();
    // Mantine v7 forwards data-testid to the inner <input> directly.
    await diff.fragmentToggle(1).click({ force: true });
    await expect(diff.paneLinesByFragment('left', 1)).toHaveCount(0);
  });

  test('clicking fragment scrolls both panes to its lines', async ({ teacherPage }) => {
    const diff = new PairDiffPage(teacherPage);
    await diff.open(RUN, PAIR);
    await diff.fragmentControl(1).click();
    await teacherPage.waitForTimeout(300); // allow smooth-scroll to start
    await expect(diff.paneLine('left', 9)).toBeVisible();
    await expect(diff.paneLine('right', 9)).toBeVisible();
  });

  test('similarity bar reflects pair similarity (high zone)', async ({ teacherPage }) => {
    const diff = new PairDiffPage(teacherPage);
    await diff.open(RUN, PAIR);
    await expect(
      teacherPage.locator('[data-similarity-zone="high"]').first(),
    ).toBeVisible();
  });
});
