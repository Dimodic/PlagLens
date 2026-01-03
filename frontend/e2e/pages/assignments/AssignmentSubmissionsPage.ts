/**
 * Page Object: /assignments/:id/submissions — full table + filters.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class AssignmentSubmissionsPage {
  readonly page: Page;
  readonly assignmentId: string;

  constructor(page: Page, assignmentId: string) {
    this.page = page;
    this.assignmentId = assignmentId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/assignments/${this.assignmentId}/submissions`);
    await this.page.waitForLoadState('networkidle');
  }

  authorFilter(): Locator {
    return this.page.getByTestId('assignment-submissions-filter-author');
  }
  statusFilter(): Locator {
    return this.page.getByTestId('assignment-submissions-filter-status');
  }
  languageFilter(): Locator {
    return this.page.getByTestId('assignment-submissions-filter-language');
  }
  lateFilter(): Locator {
    return this.page.getByTestId('assignment-submissions-filter-late');
  }
  suspiciousFilter(): Locator {
    return this.page.getByTestId('assignment-submissions-filter-suspicious');
  }

  rows(): Locator {
    return this.page.locator('[data-testid^="submission-table-row-"]');
  }

  rowById(id: string): Locator {
    return this.page.getByTestId(`submission-table-row-${id}`);
  }

  async toggleLate(): Promise<void> {
    await this.lateFilter().click();
  }

  async toggleSuspicious(): Promise<void> {
    await this.suspiciousFilter().click();
  }

  async expectRowsCountAtLeast(n: number): Promise<void> {
    await expect.poll(async () => this.rows().count(), { timeout: 5000 }).toBeGreaterThanOrEqual(n);
  }
}
