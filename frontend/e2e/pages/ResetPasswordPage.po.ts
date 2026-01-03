/**
 * Page Object: /auth/reset
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';
import { inputByTestId } from '../helpers/inputs';

export class ResetPasswordPagePo {
  readonly page: Page;
  readonly newPassword: Locator;
  readonly confirmPassword: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newPassword = inputByTestId(page, TEST_IDS.resetNewPassword);
    this.confirmPassword = inputByTestId(page, TEST_IDS.resetConfirmPassword);
    this.submit = page.getByTestId(TEST_IDS.resetSubmit);
  }

  async gotoWithToken(token: string): Promise<void> {
    await this.page.goto(`/auth/reset?token=${encodeURIComponent(token)}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
