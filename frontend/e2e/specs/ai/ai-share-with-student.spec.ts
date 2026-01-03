/**
 * AI — share/unshare analysis with student (gating preview).
 */
import { test, expect } from '../../setup/fixtures';
import { SubmissionAIReportPage } from '../../pages/ai/SubmissionAIReportPage';
import { mockJson, makeAnalysis } from '../../helpers/plagAi';

const SUB = 'sub_share';

test.describe('AI / share-with-student', () => {
  test('share button posts and badge appears after refetch', async ({
    teacherPage,
  }) => {
    let shareCalls = 0;
    let isShared = false;
    await teacherPage.route(
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            makeAnalysis({
              id: 'aia_share',
              submission_id: SUB,
              shared_with_student: isShared,
            }),
          ),
        });
      },
    );
    await mockJson(teacherPage, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
      data: [],
      total: 0,
    });
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, { data: [], total: 0 });
    await teacherPage.route(
      /\/api\/v1\/ai-analyses\/[^/]+:share-with-student/,
      async (route) => {
        shareCalls++;
        isShared = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(SUB);
    await page.shareButton.click();
    await teacherPage.waitForTimeout(200);
    expect(shareCalls).toBe(1);
  });

  test('unshare button posts when already shared', async ({ teacherPage }) => {
    let unshareCalls = 0;
    await mockJson(
      teacherPage,
      /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/,
      makeAnalysis({ id: 'aia_unshare', submission_id: SUB, shared_with_student: true }),
    );
    await mockJson(teacherPage, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
      data: [],
      total: 0,
    });
    await mockJson(teacherPage, /\/api\/v1\/admin\/ai\/prompt-versions/, { data: [], total: 0 });
    await teacherPage.route(
      /\/api\/v1\/ai-analyses\/[^/]+:unshare/,
      async (route) => {
        unshareCalls++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(SUB);
    await expect(page.sharedBadge).toBeVisible();
    await page.unshareButton.click();
    await teacherPage.waitForTimeout(200);
    expect(unshareCalls).toBe(1);
  });

  test('student visiting AI report URL is denied (RoleGuard)', async ({ studentPage }) => {
    await studentPage.goto(`/submissions/${SUB}/ai-report`);
    await expect(studentPage.getByText(/404|не найдено|Page not found/i).first())
      .toBeVisible({ timeout: 5_000 });
  });
});
