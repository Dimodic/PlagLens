/**
 * Page Object: /courses/:slug/groups
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';
import { fillInput } from '../../helpers/inputs';

export class CourseGroupsPagePo {
  readonly page: Page;
  readonly title: Locator;
  readonly createButton: Locator;
  readonly nameInput: Locator;
  readonly capacityInput: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId(TEST_IDS.courseGroupsTitle);
    this.createButton = page.getByTestId(TEST_IDS.courseGroupsCreateButton);
    this.nameInput = page.locator(
      `[data-testid="${TEST_IDS.courseGroupsName}"] input`,
    );
    this.capacityInput = page.locator(
      `[data-testid="${TEST_IDS.courseGroupsCapacity}"] input`,
    );
    this.submit = page.getByTestId(TEST_IDS.courseGroupsSubmit);
  }

  async gotoBySlug(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/groups`);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.title).toBeVisible({ timeout: 15_000 });
  }

  rowForId(id: string | number): Locator {
    return this.page.getByTestId(`group-${id}`);
  }

  async openCreateDialog(): Promise<void> {
    await this.createButton.click();
    await expect(this.nameInput).toBeVisible({ timeout: 5_000 });
  }

  async createGroup(name: string, capacity?: number): Promise<void> {
    await this.openCreateDialog();
    await fillInput(this.page, TEST_IDS.courseGroupsName, name);
    if (capacity !== undefined) {
      await this.capacityInput.fill(String(capacity));
    }
    await this.submit.click();
  }
}
