/**
 * Page Object: /me/profile
 */
import type { Locator, Page } from '@playwright/test';

export class ProfilePo {
  readonly page: Page;
  readonly emailReadonly: Locator;
  readonly displayName: Locator;
  readonly localeSelect: Locator;
  readonly timezone: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailReadonly = page.getByTestId('profile-email-readonly');
    this.displayName = page.getByTestId('profile-display-name-input');
    this.localeSelect = page.getByTestId('profile-locale-select');
    this.timezone = page.getByTestId('profile-timezone-input');
    this.saveButton = page.getByTestId('profile-save-button');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/profile');
    await this.page.waitForLoadState('domcontentloaded');
  }
}
