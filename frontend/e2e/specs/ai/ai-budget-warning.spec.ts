/**
 * AI — budget UI when usage crosses the soft warn threshold.
 */
import { test, expect } from '../../setup/fixtures';
import { BudgetsPage } from '../../pages/ai/BudgetsPage';
import { mockJson } from '../../helpers/plagAi';

test.describe('AI / budget warning', () => {
  test('80% usage paints meter into "warn" state', async ({ adminPage }) => {
    await mockJson(adminPage, /\/api\/v1\/tenants\/[^/]+\/ai\/budget$/, {
      scope: 'tenant',
      scope_id: 'tnt_demo',
      period: 'month',
      max_tokens: 10_000,
      max_cost: 50,
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
        prompt_tokens: 5_000,
        completion_tokens: 3_500,
        total_tokens: 8_500, // 85% of 10_000
        total_cost: 42, // 84% of 50
        analyses_count: 50,
        cache_hits: 20,
      },
      history: [],
    });

    const page = new BudgetsPage(adminPage);
    await page.open();
    await expect(page.tokensMeter).toBeVisible();
    await expect(page.tokensMeter).toHaveAttribute('data-state', 'warn');
    await expect(page.costMeter).toHaveAttribute('data-state', 'warn');
    await expect(page.tokensPct).toContainText(/85/);
  });

  test('30% usage paints meter into "ok" state', async ({ adminPage }) => {
    await mockJson(adminPage, /\/api\/v1\/tenants\/[^/]+\/ai\/budget$/, {
      scope: 'tenant',
      scope_id: 'tnt_demo',
      period: 'month',
      max_tokens: 10_000,
      max_cost: null,
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
        prompt_tokens: 1_000,
        completion_tokens: 2_000,
        total_tokens: 3_000,
        total_cost: 0,
        analyses_count: 10,
        cache_hits: 0,
      },
      history: [],
    });

    const page = new BudgetsPage(adminPage);
    await page.open();
    await expect(page.tokensMeter).toHaveAttribute('data-state', 'ok');
  });
});
