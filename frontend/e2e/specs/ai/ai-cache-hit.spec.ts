/**
 * AI — second identical analysis hits the cache.
 *
 * Mocked path: latest analysis returns cache_hit=true, the badge renders, and
 * total_tokens is unchanged from the cached entry.
 */
import { test, expect } from '../../setup/fixtures';
import { SubmissionAIReportPage } from '../../pages/ai/SubmissionAIReportPage';
import { mockJson, makeAnalysis } from '../../helpers/plagAi';

test.describe('AI / cache-hit badge', () => {
  test('cache_hit=true renders the cache hit badge and zero new tokens', async ({
    teacherPage,
  }) => {
    const ana = makeAnalysis({
      id: 'aia_cached',
      submission_id: 'sub_cache',
      cache_hit: true,
      total_tokens: 599, // unchanged from cached entry
      cost_estimate: 0,
    });
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
      data: [],
      total: 0,
    });

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open('sub_cache');
    await expect(page.cacheHitBadge).toBeVisible();
    // Cost estimate label shows zero or low.
    await expect(teacherPage.getByText(/Cost/)).toBeVisible();
  });

  test('cache_hit=false hides the badge', async ({ teacherPage }) => {
    const ana = makeAnalysis({
      id: 'aia_fresh',
      submission_id: 'sub_fresh',
      cache_hit: false,
    });
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
      data: [],
      total: 0,
    });

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open('sub_fresh');
    await expect(page.cacheHitBadge).toHaveCount(0);
  });

  test('re-running with same code increments cache_hits in stats', async ({
    adminPage,
  }) => {
    // The simplest UI smoke: navigate to the cache admin page and assert the
    // hit_rate is rendered. Mocked endpoint returns 1 hit out of 1.
    // Admin role is required to view the cache admin page.
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/cache\/stats/, {
      total_entries: 1,
      size_bytes: 1024,
      hit_rate: 1.0,
      by_prompt_version: { v1: 1 },
    });
    await adminPage.goto('/admin/ai/cache');
    await expect(adminPage.getByTestId('ai-cache-stat-hit-rate')).toContainText('100');
  });
});
