/**
 * Page Object: /me/submissions — student-facing list of own submissions.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class MySubmissionsPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/submissions');
    await expect(this.page.getByTestId('my-submissions-list')).toBeVisible();
  }

  rows(): Locator {
    return this.page.locator('[data-testid^="submission-table-row-"]');
  }

  rowById(id: string): Locator {
    return this.page.getByTestId(`submission-table-row-${id}`);
  }

  languageFilter(): Locator {
    return this.page.getByTestId('my-submissions-language-filter');
  }

  async openSubmission(id: string): Promise<void> {
    await this.rowById(id).getByRole('link').click();
    await this.page.waitForURL(`/submissions/${id}`);
  }
}
