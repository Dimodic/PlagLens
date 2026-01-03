/**
 * AI — regenerate.
 */
import { test, expect } from '../../setup/fixtures';
import { SubmissionAIReportPage } from '../../pages/ai/SubmissionAIReportPage';
import { mockJson, makeAnalysis, makePromptVersion } from '../../helpers/plagAi';

test.describe('AI / regenerate', () => {
  test('regenerate button posts to :regenerate endpoint', async ({ teacherPage }) => {
    const ana = makeAnalysis({ id: 'aia_old', submission_id: 'sub_42' });
    let regenerateCalled = 0;
    await mockJson(
      teacherPage,
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/,
      ana,
    );
    await mockJson(teacherPage, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
      data: [ana],
      total: 1,
    });
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, {
      data: [makePromptVersion()],
      total: 1,
    });
    await teacherPage.route(/\/api\/v1\/ai-analyses\/[^/]+:regenerate/, async (route) => {
      regenerateCalled++;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          operation_id: 'op_regen',
          status_url: '/api/v1/operations/op_regen',
        }),
      });
    });

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open('sub_42');
    await page.regenerateButton.click();
    await teacherPage.waitForTimeout(200);
    expect(regenerateCalled).toBe(1);
    await expect(teacherPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/regenerate|Regenerate|очередь|поставлен|не удалось/i, { timeout: 5_000 });
  });

  test('history accordion lists older regenerations', async ({ teacherPage }) => {
    const latest = makeAnalysis({ id: 'aia_new', submission_id: 'sub_42', total_tokens: 700 });
    const old = makeAnalysis({
      id: 'aia_old',
      submission_id: 'sub_42',
      total_tokens: 599,
      parent_analysis_id: null,
      finished_at: '2026-05-01T10:00:00Z',
    });
    await mockJson(
      teacherPage,
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/,
      latest,
    );
    await mockJson(teacherPage, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
      data: [latest, old],
      total: 2,
    });
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, {
      data: [],
      total: 0,
    });

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open('sub_42');
    await expect(teacherPage.getByText('История регенераций')).toBeVisible();
    await expect(teacherPage.getByText(/aia_old|599 tokens/)).toBeVisible();
  });
});
