/**
 * Page Object: /courses/:slug/settings
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';
import { fillInput, inputByTestId } from '../../helpers/inputs';

export class CourseSettingsPagePo {
  readonly page: Page;
  readonly form: Locator;
  readonly name: Locator;
  readonly corsOrigins: Locator;
  readonly submit: Locator;
  readonly cancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.getByTestId(TEST_IDS.courseSettingsForm);
    this.name = inputByTestId(page, TEST_IDS.courseSettingsName);
    this.corsOrigins = inputByTestId(page, TEST_IDS.courseSettingsCorsOrigins);
    this.submit = page.getByTestId(TEST_IDS.courseSettingsSubmit);
    this.cancel = page.getByTestId(TEST_IDS.courseSettingsCancel);
  }

  async gotoBySlug(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/settings`);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.form).toBeVisible({ timeout: 15_000 });
  }

  async setName(name: string): Promise<void> {
    await fillInput(this.page, TEST_IDS.courseSettingsName, name);
  }

  async submitForm(): Promise<void> {
    await this.submit.click();
  }
}
