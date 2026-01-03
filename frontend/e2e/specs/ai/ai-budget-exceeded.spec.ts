/**
 * AI — budget exceeded.
 *
 * When the gateway returns 429 BUDGET_EXCEEDED, no new analyses can be
 * started: the UI surfaces the problem alert / blocks the start path.
 */
import { test, expect } from '../../setup/fixtures';
import { BudgetsPage } from '../../pages/ai/BudgetsPage';
import { SubmissionAIReportPage } from '../../pages/ai/SubmissionAIReportPage';
import { mockJson } from '../../helpers/plagAi';

test.describe('AI / budget exceeded', () => {
  test('100% usage paints meter into "exceeded" state', async ({ adminPage }) => {
    await mockJson(adminPage, /\/api\/v1\/tenants\/[^/]+\/ai\/budget$/, {
      scope: 'tenant',
      scope_id: 'tnt_demo',
      period: 'month',
      max_tokens: 1_000,
      max_cost: 10,
      soft_warn_at: 0.8,
      hard_stop_at: 1.0,
      reset_at: '2026-06-01T00:00:00Z',
    });
    await mockJson(adminPage, /\/api\/v1\/tenants\/[^/]+\/ai\/usage$/, {
      current: {
        scope: 'tenant',
        scope_id: 'tnt_demo',
        period: 'month',
        period_start: '2026-05-01T00:00:00Z',
        prompt_tokens: 600,
        completion_tokens: 500,
        total_tokens: 1_100, // > 1000
        total_cost: 12,
        analyses_count: 50,
        cache_hits: 5,
      },
      history: [],
    });

    const page = new BudgetsPage(adminPage);
    await page.open();
    await expect(page.tokensMeter).toHaveAttribute('data-state', 'exceeded');
  });

  test('starting an analysis is rejected with BUDGET_EXCEEDED toast', async ({
    teacherPage,
  }) => {
    // 404 to render the "no latest" state with the start button.
    await teacherPage.route(
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ status: 404 }),
        });
      },
    );
    await mockJson(teacherPage, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
      data: [],
      total: 0,
    });
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, {
      data: [],
      total: 0,
    });
    await teacherPage.route(
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/,
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({
              type: 'about:blank',
              title: 'Бюджет превышен',
              status: 429,
              code: 'BUDGET_EXCEEDED',
              detail: 'Лимит на месяц исчерпан',
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], total: 0 }),
        });
      },
    );

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open('sub_budget');
    await teacherPage.getByRole('button', { name: /Запустить анализ/i }).click();
    await expect(teacherPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/Бюджет|превыш|429|Limit|isch|исчерп/i, { timeout: 5_000 });
  });
});
