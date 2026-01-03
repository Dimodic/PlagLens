/**
 * Page Object: /submissions/:id/ai-report — single-submission AI report.
 *
 * Reads SubmissionAIReportView + CurateAsFeedbackModal — both expose
 * data-testids the spec uses to assert summary/badges/buttons.
 */
import type { Locator, Page } from '@playwright/test';

export class SubmissionAIReportPage {
  constructor(public readonly page: Page) {}

  async open(submissionId: string): Promise<void> {
    await this.page.goto(`/submissions/${submissionId}/ai-report`);
  }

  get root(): Locator {
    return this.page.getByTestId('ai-report-page');
  }

  get summary(): Locator {
    return this.page.getByTestId('ai-analysis-summary');
  }

  get summaryCard(): Locator {
    return this.page.getByTestId('ai-analysis-summary-card');
  }

  get riskSignalsContainer(): Locator {
    return this.page.getByTestId('ai-analysis-risk-signals');
  }

  riskSignal(type: string, severity: 'low' | 'medium' | 'high'): Locator {
    return this.page.getByTestId(`ai-risk-signal-${type}-${severity}`);
  }

  question(i: number): Locator {
    return this.page.getByTestId(`ai-question-${i}`);
  }

  recommendation(i: number): Locator {
    return this.page.getByTestId(`ai-recommendation-${i}`);
  }

  get cacheHitBadge(): Locator {
    return this.page.getByTestId('ai-cache-hit-badge');
  }

  get sharedBadge(): Locator {
    return this.page.getByTestId('ai-shared-badge');
  }

  get regenerateButton(): Locator {
    return this.page.getByTestId('ai-regenerate-button');
  }

  get curateOpenButton(): Locator {
    return this.page.getByTestId('ai-curate-open');
  }

  get shareButton(): Locator {
    return this.page.getByTestId('ai-share-button');
  }

  get unshareButton(): Locator {
    return this.page.getByTestId('ai-unshare-button');
  }

  // ---------- curate modal ----------

  get curateModal(): Locator {
    return this.page
      .getByTestId('ai-curate-modal')
      .locator('.mantine-Modal-content');
  }

  get curateSummary(): Locator {
    // Mantine Textarea forwards data-testid to inner <textarea>; legacy code
    // sometimes places it on the wrapper. Match both.
    return this.page
      .locator(
        'textarea[data-testid="ai-curate-summary"], [data-testid="ai-curate-summary"] textarea',
      )
      .first();
  }

  curateInclude(type: string): Locator {
    // Mantine Checkbox forwards data-testid to the inner <input>; we want the
    // input directly so toBeChecked() works without locator gymnastics.
    return this.page
      .locator(
        `input[data-testid="ai-curate-include-${type}"], [data-testid="ai-curate-include-${type}"] input`,
      )
      .first();
  }

  get curateVisibleToStudent(): Locator {
    return this.page.getByTestId('ai-curate-visible-to-student');
  }

  get curateSubmit(): Locator {
    return this.page.getByTestId('ai-curate-submit');
  }
}
