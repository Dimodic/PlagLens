/**
 * Plagiarism — runs list.
 *
 * Covers /assignments/:id/plagiarism: empty state, populated table, columns,
 * "Запустить новую проверку" modal opens with default values. All tests use
 * mocked API responses to stay fast and independent of seed state.
 */
import { test, expect } from '../../setup/fixtures';
import { PlagiarismRunsListPage } from '../../pages/plagiarism/PlagiarismRunsListPage';
import { mockJson, makeRun } from '../../helpers/plagAi';

const ASG = 'asg_demo';

test.describe('Plagiarism / runs list', () => {
  test('shows empty state when no runs exist', async ({ teacherPage }) => {
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: [],
      total: 0,
    });
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    await expect(list.title).toBeVisible();
    await expect(teacherPage.getByText(/Проверок ещё не было/)).toBeVisible();
  });

  test('renders table with runs and key columns', async ({ teacherPage }) => {
    const runs = [
      makeRun({ id: 'run_alpha', provider: 'jplag', status: 'completed', max_similarity: 0.91 }),
      makeRun({ id: 'run_beta', provider: 'moss', status: 'running', pairs_suspected: 0 }),
      makeRun({ id: 'run_gamma', provider: 'jplag', status: 'failed' }),
    ];
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: runs,
      total: runs.length,
    });
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);

    await expect(list.runsTable).toBeVisible();
    await expect(list.runRow('run_alpha')).toBeVisible();
    await expect(list.runRow('run_beta')).toBeVisible();
    await expect(list.runRow('run_gamma')).toBeVisible();
    // Provider column.
    await expect(list.runRow('run_alpha')).toContainText('jplag');
    await expect(list.runRow('run_beta')).toContainText('moss');
    // Submissions column non-null number.
    await expect(list.runRow('run_alpha')).toContainText('4');
  });

  test('opens create-run modal with default values', async ({ teacherPage }) => {
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: [makeRun({ id: 'run_x' })],
      total: 1,
    });
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    await list.openCreateModal();
    await expect(list.createModal).toBeVisible();
    await expect(list.providerSelect).toBeVisible();
    // Mantine v7 forwards data-testid to the inner <input>.
    await expect(list.withCorpusCheckbox).toBeChecked();
    await expect(list.submitCreateButton).toBeEnabled();
    await list.cancelCreateButton.click();
    await expect(list.createModal).not.toBeVisible();
  });

  test('row has open link to /plagiarism-runs/:id', async ({ teacherPage }) => {
    const runs = [makeRun({ id: 'run_alpha' })];
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: runs,
      total: 1,
    });
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    const row = list.runRow('run_alpha');
    await expect(row.getByRole('link', { name: /Открыть/ })).toHaveAttribute(
      'href',
      /\/plagiarism-runs\/run_alpha/,
    );
  });

  test('similarity bar zone is rendered for each row', async ({ teacherPage }) => {
    const runs = [
      makeRun({ id: 'r_high', max_similarity: 0.92 }),
      makeRun({ id: 'r_med', max_similarity: 0.55 }),
      makeRun({ id: 'r_low', max_similarity: 0.2 }),
    ];
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: runs,
      total: runs.length,
    });
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    await expect(list.runRow('r_high').locator('[data-similarity-zone="high"]')).toBeVisible();
    await expect(list.runRow('r_med').locator('[data-similarity-zone="medium"]')).toBeVisible();
    await expect(list.runRow('r_low').locator('[data-similarity-zone="low"]')).toBeVisible();
  });

  test('Auto-refresh switch is rendered (disabled per current behaviour)', async ({
    teacherPage,
  }) => {
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/plagiarism-runs/, {
      data: [],
      total: 0,
    });
    const list = new PlagiarismRunsListPage(teacherPage);
    await list.open(ASG);
    // Mantine renders the actual <input> hidden + a styled track. We assert
    // the label text is present in the DOM rather than the hidden checkbox.
    await expect(teacherPage.getByText(/Auto-refresh/i).first()).toBeVisible();
  });
});
