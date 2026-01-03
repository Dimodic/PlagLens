/**
 * Page Object: /auth/forgot
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';
import { inputByTestId } from '../helpers/inputs';

export class ForgotPasswordPagePo {
  readonly page: Page;
  readonly email: Locator;
  readonly tenantSlug: Locator;
  readonly submit: Locator;
  readonly success: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = inputByTestId(page, TEST_IDS.forgotEmail);
    this.tenantSlug = inputByTestId(page, TEST_IDS.forgotTenantSlug);
    this.submit = page.getByTestId(TEST_IDS.forgotSubmit);
    this.success = page.getByTestId(TEST_IDS.forgotSuccess);
  }

  async goto(): Promise<void> {
    await this.page.goto('/auth/forgot');
    await this.page.waitForLoadState('domcontentloaded');
  }
}
