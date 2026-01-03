/**
 * AI — analyses list per assignment.
 */
import { test, expect } from '../../setup/fixtures';
import { AnalysisListPage } from '../../pages/ai/AnalysisListPage';
import { mockJson, makeAnalysis } from '../../helpers/plagAi';

const ASG = 'asg_demo';

test.describe('AI / analyses list', () => {
  test('shows empty state when no analyses', async ({ teacherPage }) => {
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/ai-analyses/, {
      data: [],
      total: 0,
    });
    const page = new AnalysisListPage(teacherPage);
    await page.open(ASG);
    await expect(teacherPage.getByText(/Анализов ещё не было/)).toBeVisible();
  });

  test('renders rows with provider, model, tokens columns', async ({ teacherPage }) => {
    const data = [
      makeAnalysis({ id: 'aia_1' }),
      makeAnalysis({ id: 'aia_2', cache_hit: true, cost_estimate: 0 }),
      makeAnalysis({ id: 'aia_3', status: 'failed', total_tokens: 0 }),
    ];
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/ai-analyses/, {
      data,
      total: data.length,
    });
    const page = new AnalysisListPage(teacherPage);
    await page.open(ASG);
    await expect(page.table).toBeVisible();
    for (const a of data) {
      await expect(page.row(a.id as string)).toBeVisible();
    }
    await expect(page.row('aia_1')).toContainText('openrouter');
    await expect(page.row('aia_1')).toContainText('gpt-4o-mini');
  });

  test('row link navigates to /submissions/:id/ai-report', async ({ teacherPage }) => {
    const ana = makeAnalysis({
      id: 'aia_link',
      submission_id: 'sub_42',
      report: null,
    });
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/ai-analyses/, {
      data: [ana],
      total: 1,
    });
    const page = new AnalysisListPage(teacherPage);
    await page.open(ASG);
    const link = page
      .row(ana.id as string)
      .getByRole('link', { name: /open|Открыть/i });
    await expect(link).toHaveAttribute('href', /\/submissions\/sub_42\/ai-report/);
  });

  test('failed-status badge is visible', async ({ teacherPage }) => {
    await mockJson(teacherPage, /\/api\/v1\/assignments\/[^/]+\/ai-analyses/, {
      data: [makeAnalysis({ id: 'aia_failed', status: 'failed' })],
      total: 1,
    });
    const page = new AnalysisListPage(teacherPage);
    await page.open(ASG);
    await expect(page.row('aia_failed')).toContainText(/failed|упал|error|Ошибка/i);
  });
});
