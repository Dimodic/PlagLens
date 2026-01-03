/**
 * Page Object: /assignments/:assignmentId/ai-analyses — analyses table.
 */
import type { Locator, Page } from '@playwright/test';

export class AnalysisListPage {
  constructor(public readonly page: Page) {}

  async open(assignmentId: string): Promise<void> {
    await this.page.goto(`/assignments/${assignmentId}/ai-analyses`);
  }

  get table(): Locator {
    return this.page.getByTestId('ai-analysis-list-table');
  }

  row(analysisId: string): Locator {
    return this.page.getByTestId(`ai-analysis-row-${analysisId}`);
  }
}
