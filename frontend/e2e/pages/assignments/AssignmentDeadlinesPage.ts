/**
 * Page Object: /assignments/:id/deadlines — per-user deadline extensions.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class AssignmentDeadlinesPage {
  readonly page: Page;
  readonly assignmentId: string;

  constructor(page: Page, assignmentId: string) {
    this.page = page;
    this.assignmentId = assignmentId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/assignments/${this.assignmentId}/deadlines`);
    await expect(this.page.getByTestId('deadline-extension-add')).toBeVisible();
  }

  addButton(): Locator {
    return this.page.getByTestId('deadline-extension-add');
  }

  async openAddModal(): Promise<void> {
    await this.addButton().click();
    await expect(this.page.getByTestId('deadline-extension-user_id')).toBeVisible();
  }

  userIdInput(): Locator {
    return this.page.getByTestId('deadline-extension-user_id');
  }
  reasonInput(): Locator {
    return this.page.getByTestId('deadline-extension-reason');
  }
  submitButton(): Locator {
    return this.page.getByTestId('deadline-extension-submit');
  }
  cancelButton(): Locator {
    return this.page.getByTestId('deadline-extension-cancel');
  }

  async createExtension(userId: string, reason?: string): Promise<void> {
    await this.userIdInput().fill(userId);
    if (reason) {
      await this.reasonInput().fill(reason);
    }
    await this.submitButton().click();
  }

  async expectExtensionRowsCount(n: number): Promise<void> {
    const rows = this.page.locator('[data-testid^="ext-"]');
    await expect.poll(async () => rows.count(), { timeout: 5000 }).toBeGreaterThanOrEqual(n);
  }

  async expectVisibleForUser(displayName: string): Promise<void> {
    await expect(this.page.locator('table').filter({ hasText: displayName })).toBeVisible();
  }
}
