/**
 * Page Object: /admin/plagiarism-corpus — corpus stats + rebuild action.
 */
import type { Locator, Page } from '@playwright/test';

export class CorpusPage {
  constructor(public readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/admin/plagiarism-corpus');
  }

  get rebuildButton(): Locator {
    return this.page.getByTestId('plagiarism-corpus-rebuild');
  }

  get statEntries(): Locator {
    return this.page.getByTestId('plagiarism-corpus-stat-entries');
  }

  get content(): Locator {
    return this.page.getByTestId('plagiarism-corpus-content');
  }
}
