/**
 * AI — curate analysis as SubmissionFeedback (modal).
 */
import { test, expect } from '../../setup/fixtures';
import { SubmissionAIReportPage } from '../../pages/ai/SubmissionAIReportPage';
import { mockJson, makeAnalysis } from '../../helpers/plagAi';

const SUB = 'sub_curate';

async function arrange(page: import('@playwright/test').Page) {
  const ana = makeAnalysis({ id: 'aia_curate', submission_id: SUB });
  await mockJson(page, /\/api\/v1\/submissions\/[^/]+\/ai-analyses\/latest$/, ana);
  await mockJson(page, /\/api\/v1\/submissions\/[^/]+\/ai-analyses(\?|$)/, {
    data: [ana],
    total: 1,
  });
  await mockJson(page, /\/api\/v1\/admin\/ai\/prompt-versions/, { data: [], total: 0 });
}

test.describe('AI / curate as feedback', () => {
  test('opens modal with pre-filled summary and risk_signals', async ({
    teacherPage,
  }) => {
    await arrange(teacherPage);
    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(SUB);
    await page.curateOpenButton.click();
    await expect(page.curateModal).toBeVisible();
    await expect(page.curateSummary).not.toBeEmpty();
    // Default checkboxes for the seeded signals.
    await expect(page.curateInclude('style_jump')).toBeChecked();
    await expect(page.curateInclude('generic_solution')).toBeChecked();
  });

  test('summary is editable and visible_to_student toggles', async ({ teacherPage }) => {
    await arrange(teacherPage);
    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(SUB);
    await page.curateOpenButton.click();
    const ta = page.curateSummary;
    await ta.fill('Редактированное резюме от преподавателя');
    await expect(ta).toHaveValue('Редактированное резюме от преподавателя');
    // Mantine v7 hides the inner <input>; trigger the native click in page
    // context so React's delegated onChange handler fires.
    await teacherPage.evaluate(() => {
      const inp = document.querySelector(
        'input[data-testid="ai-curate-visible-to-student"]',
      ) as HTMLInputElement | null;
      inp?.click();
    });
    await expect(page.curateVisibleToStudent).toBeChecked();
  });

  test('submit POSTs to :curate-as-feedback', async ({ teacherPage }) => {
    await arrange(teacherPage);
    let captured: unknown = null;
    await teacherPage.route(
      /\/api\/v1\/ai-analyses\/[^/]+:curate-as-feedback/,
      async (route) => {
        captured = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ feedback_id: 'fb_001', submission_id: SUB }),
        });
      },
    );

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(SUB);
    await page.curateOpenButton.click();
    await page.curateSummary.fill('Резюме после редакции');
    // Keep visible_to_student off to avoid sending PII to the student.
    await page.curateSubmit.click();
    await teacherPage.waitForTimeout(200);
    expect(captured).toMatchObject({
      edited_summary: 'Резюме после редакции',
      visible_to_student: false,
    });
  });

  test('toggling off a risk-signal excludes it from the request', async ({
    teacherPage,
  }) => {
    await arrange(teacherPage);
    let captured: { include_risk_signals?: string[] } | null = null;
    await teacherPage.route(
      /\/api\/v1\/ai-analyses\/[^/]+:curate-as-feedback/,
      async (route) => {
        captured = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ feedback_id: 'fb_002', submission_id: SUB }),
        });
      },
    );

    const page = new SubmissionAIReportPage(teacherPage);
    await page.open(SUB);
    await page.curateOpenButton.click();
    // Uncheck style_jump.
    await page.curateInclude('style_jump').click({ force: true });
    await page.curateSubmit.click();
    await teacherPage.waitForTimeout(200);
    expect(captured?.include_risk_signals).not.toContain('style_jump');
    expect(captured?.include_risk_signals).toContain('generic_solution');
  });
});
