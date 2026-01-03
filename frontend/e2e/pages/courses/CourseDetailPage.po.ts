/**
 * Page Object: /courses/:slug — course detail header + tabs.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';

export class CourseDetailPagePo {
  readonly page: Page;
  readonly header: Locator;
  readonly title: Locator;
  readonly status: Locator;
  readonly slug: Locator;
  readonly settingsButton: Locator;
  readonly menuTrigger: Locator;
  readonly menu: Locator;
  readonly duplicateMenuItem: Locator;
  readonly archiveMenuItem: Locator;
  readonly unarchiveMenuItem: Locator;
  readonly tabAssignments: Locator;
  readonly tabMembers: Locator;
  readonly tabGroups: Locator;
  readonly tabInvitations: Locator;
  readonly tabStats: Locator;
  readonly createAssignmentButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByTestId(TEST_IDS.courseDetailHeader);
    this.title = page.getByTestId(TEST_IDS.courseDetailTitle);
    this.status = page.getByTestId(TEST_IDS.courseDetailStatus);
    this.slug = page.getByTestId(TEST_IDS.courseDetailSlug);
    this.settingsButton = page.getByTestId(TEST_IDS.courseDetailSettingsButton);
    this.menuTrigger = page.getByTestId(TEST_IDS.courseDetailMenuTrigger);
    this.menu = page.getByTestId(TEST_IDS.courseDetailMenu);
    this.duplicateMenuItem = page.getByTestId(TEST_IDS.courseDetailDuplicate);
    this.archiveMenuItem = page.getByTestId(TEST_IDS.courseDetailArchive);
    this.unarchiveMenuItem = page.getByTestId(TEST_IDS.courseDetailUnarchive);
    this.tabAssignments = page.getByTestId(TEST_IDS.courseDetailTabAssignments);
    this.tabMembers = page.getByTestId(TEST_IDS.courseDetailTabMembers);
    this.tabGroups = page.getByTestId(TEST_IDS.courseDetailTabGroups);
    this.tabInvitations = page.getByTestId(TEST_IDS.courseDetailTabInvitations);
    this.tabStats = page.getByTestId(TEST_IDS.courseDetailTabStats);
    this.createAssignmentButton = page.getByTestId(TEST_IDS.courseDetailCreateAssignment);
  }

  async gotoBySlug(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}`);
    await this.page.waitForLoadState('domcontentloaded');
    // Either the header or an error alert should appear.
    await Promise.race([
      this.header.waitFor({ state: 'visible', timeout: 15_000 }),
      this.page.getByRole('alert').first().waitFor({ state: 'visible', timeout: 15_000 }),
    ]);
  }

  async openMenu(): Promise<void> {
    await this.menuTrigger.click();
    await expect(this.menu).toBeVisible();
  }

  async clickArchive(): Promise<void> {
    await this.openMenu();
    await this.archiveMenuItem.click();
  }

  async confirmArchive(): Promise<void> {
    // ConfirmDialog renders a Mantine Modal — confirm button is the danger one.
    const confirm = this.page
      .locator('[role="dialog"]')
      .getByRole('button', { name: /Архивировать|Удалить|Подтвердить/i })
      .first();
    await confirm.click();
  }

  async clickDuplicate(): Promise<void> {
    await this.openMenu();
    await this.duplicateMenuItem.click();
  }

  async clickUnarchive(): Promise<void> {
    await this.openMenu();
    await this.unarchiveMenuItem.click();
  }
}
