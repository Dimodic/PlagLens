/**
 * Page Object: /courses/:slug/members
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';
import { fillInput } from '../../helpers/inputs';

export class CourseMembersPagePo {
  readonly page: Page;
  readonly title: Locator;
  readonly addButton: Locator;
  readonly bulkButton: Locator;
  readonly addUserId: Locator;
  readonly addRole: Locator;
  readonly addSubmit: Locator;
  readonly bulkEmails: Locator;
  readonly bulkRole: Locator;
  readonly bulkSubmit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId(TEST_IDS.courseMembersTitle);
    this.addButton = page.getByTestId(TEST_IDS.courseMembersAddButton);
    this.bulkButton = page.getByTestId(TEST_IDS.courseMembersBulkButton);
    this.addUserId = page.locator(
      `[data-testid="${TEST_IDS.courseMembersAddUserId}"] input`,
    );
    this.addRole = page.locator(
      `[data-testid="${TEST_IDS.courseMembersAddRole}"] input`,
    );
    this.addSubmit = page.getByTestId(TEST_IDS.courseMembersAddSubmit);
    this.bulkEmails = page.locator(
      `[data-testid="${TEST_IDS.courseMembersBulkEmails}"] textarea`,
    );
    this.bulkRole = page.locator(
      `[data-testid="${TEST_IDS.courseMembersBulkRole}"] input`,
    );
    this.bulkSubmit = page.getByTestId(TEST_IDS.courseMembersBulkSubmit);
  }

  async gotoBySlug(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/members`);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.title).toBeVisible({ timeout: 15_000 });
  }

  rowForUserId(userId: string): Locator {
    return this.page.getByTestId(TEST_IDS.courseMemberRow(userId));
  }

  async openAddDialog(): Promise<void> {
    await this.addButton.click();
    await expect(this.addUserId).toBeVisible({ timeout: 5_000 });
  }

  async openBulkDialog(): Promise<void> {
    await this.bulkButton.click();
    await expect(this.bulkEmails).toBeVisible({ timeout: 5_000 });
  }

  async addMember(userId: string, _role: 'student' | 'assistant' = 'student'): Promise<void> {
    await this.openAddDialog();
    await fillInput(this.page, TEST_IDS.courseMembersAddUserId, userId);
    await this.addSubmit.click();
  }

  async bulkInviteEmails(
    emails: string[],
    _role: 'student' | 'assistant' = 'student',
  ): Promise<void> {
    await this.openBulkDialog();
    await this.bulkEmails.fill(emails.join('\n'));
    await this.bulkSubmit.click();
  }

  async clickRemoveMember(userId: string): Promise<void> {
    const row = this.rowForUserId(userId);
    await row.locator('[aria-label="Действия"]').click();
    await this.page.getByText('Удалить из курса').click();
  }
}
