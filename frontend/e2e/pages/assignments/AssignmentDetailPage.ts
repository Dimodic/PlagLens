/**
 * Page Object: /assignments/:id detail page.
 * Differs visually for student and teacher; tabs vary by role.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class AssignmentDetailPage {
  readonly page: Page;
  readonly assignmentId: string;

  constructor(page: Page, assignmentId: string) {
    this.page = page;
    this.assignmentId = assignmentId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/assignments/${this.assignmentId}`);
    await expect(this.page.getByTestId('assignment-detail')).toBeVisible({ timeout: 10000 });
  }

  title(): Locator {
    return this.page.getByTestId('assignment-title');
  }
  statusBadge(): Locator {
    return this.page.getByTestId('assignment-status-badge');
  }
  uploadButton(): Locator {
    return this.page.getByTestId('assignment-upload-button');
  }
  settingsButton(): Locator {
    return this.page.getByTestId('assignment-settings-button');
  }
  publishButton(): Locator {
    return this.page.getByTestId('assignment-publish-button');
  }
  actionsMenu(): Locator {
    return this.page.getByTestId('assignment-actions-menu');
  }

  async clickPublish(): Promise<void> {
    await this.publishButton().click();
  }

  async clickArchive(): Promise<void> {
    await this.actionsMenu().click();
    await this.page.getByTestId('assignment-action-archive').click();
  }

  async clickDuplicate(): Promise<void> {
    await this.actionsMenu().click();
    await this.page.getByTestId('assignment-action-duplicate').click();
  }

  async expectStatus(status: 'draft' | 'published' | 'archived'): Promise<void> {
    const map = { draft: /черновик/i, published: /опубликован/i, archived: /в архиве/i };
    await expect(this.statusBadge()).toHaveText(map[status]);
  }

  async expectStudentView(): Promise<void> {
    await expect(this.uploadButton()).toBeVisible();
    await expect(this.settingsButton()).not.toBeVisible();
  }

  async expectTeacherView(): Promise<void> {
    await expect(this.settingsButton()).toBeVisible();
    await expect(this.uploadButton()).not.toBeVisible();
  }

  async openUpload(): Promise<void> {
    await this.uploadButton().click();
    await this.page.waitForURL(/\/assignments\/[^/]+\/upload$/);
  }

  async openSettings(): Promise<void> {
    await this.settingsButton().click();
    await this.page.waitForURL(/\/assignments\/[^/]+\/settings$/);
  }
}
