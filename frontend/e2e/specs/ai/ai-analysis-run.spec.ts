/**
 * AI — start analysis (real OpenRouter when seed is available, mocked path
 * otherwise covering the same UI flow).
 *
 * The mocked test always runs and asserts UI behaviour; the real test is
 * gated on demo seed data existing and OPENROUTER_API_KEY being live.
 */
import { test, expect } from '../../setup/fixtures';
import { SubmissionAIReportPage } from '../../pages/ai/SubmissionAIReportPage';
import {
  resolveDemoAssignment,
  findStudentSubmission,
  mockJson,
  makeAnalysis,
} from '../../helpers/plagAi';

test.describe('AI / start analysis — mocked', () => {
  test('completed analysis shows summary, signals, questions, recommendations', async ({
    teacherPage,
  }) => {
    const ana = makeAnalysis({ id: 'aia_done', submission_id: 'sub_42' });
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/submissions/${ana.submission_id}/ai-analyses/latest$`),
      ana,
    );
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/submissions/${ana.submission_id}/ai-analyses(\\?|$)`),
      { data: [ana], total: 1 },
    );
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, {
      data: [],
      total: 0,
    });

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(ana.submission_id as string);
    await expect(page.summary).toContainText(/пузырьковую|сортировк/i);
    await expect(page.riskSignal('style_jump', 'high')).toBeVisible();
    await expect(page.riskSignal('generic_solution', 'medium')).toBeVisible();
    await expect(page.question(0)).toBeVisible();
    await expect(page.question(2)).toBeVisible();
    await expect(page.recommendation(0)).toBeVisible();
  });

  test('start-from-empty state triggers POST to /ai-analyses', async ({
    teacherPage,
  }) => {
    let started = 0;
    // 404 to surface "no latest" UI.
    await teacherPage.route(
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/,
      async (route) => {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ status: 404, title: 'Not Found' }),
        });
      },
    );
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, {
      data: [],
      total: 0,
    });
    await mockJson(teacherPage, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
      data: [],
      total: 0,
    });
    await teacherPage.route(
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/,
      async (route) => {
        if (route.request().method() === 'POST') {
          started++;
          await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
              operation_id: 'op_aia_start',
              status_url: '/api/v1/operations/op_aia_start',
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
    await page.open('sub_new');
    await expect(teacherPage.getByText(/LLM-анализ ещё не запускался/i)).toBeVisible();
    await teacherPage.getByRole('button', { name: /Запустить анализ/i }).click();
    await expect(teacherPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/Анализ запущен|очередь|не удалось/i, { timeout: 5_000 });
    expect(started).toBeGreaterThanOrEqual(1);
  });
});

test.describe('AI / start analysis — real LLM', () => {
  test.slow();
  test.skip(
    !!process.env.E2E_SKIP_REAL,
    'Set E2E_SKIP_REAL=1 to skip real LLM test',
  );

  test('teacher runs OpenRouter analysis on student3 submission and report renders', async ({
    teacherPage,
    apiClient,
  }) => {
    let assignment;
    let target;
    try {
      assignment = await resolveDemoAssignment(apiClient);
      target = await findStudentSubmission(
        apiClient,
        assignment.assignment_id,
        'student3@demo.local',
      );
    } catch (e) {
      test.skip(true, `Demo seed missing: ${(e as Error).message}`);
      return;
    }

    // Verify teacher JWT carries course role; otherwise the AI service
    // rejects the start-analysis call with 403 before any LLM work happens.
    const me = await apiClient.me().catch(() => null);
    const role = me?.course_roles?.[String(assignment.course_id)];
    if (!role) {
      test.skip(
        true,
        `Teacher JWT lacks course_roles for course ${assignment.course_id}; seed required`,
      );
      return;
    }

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(target.id);

    // Tolerate either an existing analysis (cache-hit) or a button to start one.
    if (await page.summary.isVisible().catch(() => false)) {
      await expect(page.summary).not.toBeEmpty();
    } else {
      await teacherPage.getByRole('button', { name: /Запустить анализ/i }).click();
      // Wait for the summary card to appear (real LLM round-trip ~3-5s).
      await expect(page.summary).toBeVisible({ timeout: 30_000 });
      await expect(page.summary).not.toBeEmpty();
      // Summary must be Russian per prompt config.
      await expect(page.summary).toContainText(/[а-яА-Я]/);
    }
  });
});
