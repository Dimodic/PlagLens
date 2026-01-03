/**
 * Page Object: AppShell — header, navbar, user menu, theme toggle.
 *
 * Used by tests that need to assert nav layout or invoke menu actions.
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';

export class AppShellPo {
  readonly page: Page;
  readonly brand: Locator;
  readonly userMenuTrigger: Locator;
  readonly logoutItem: Locator;
  readonly profileItem: Locator;
  readonly settingsItem: Locator;
  readonly themeToggle: Locator;

  constructor(page: Page) {
    this.page = page;
    this.brand = page.getByTestId(TEST_IDS.headerBrand);
    this.userMenuTrigger = page.getByTestId(TEST_IDS.headerUserMenuTrigger);
    this.logoutItem = page.getByTestId(TEST_IDS.headerUserMenuLogout);
    this.profileItem = page.getByTestId(TEST_IDS.headerUserMenuProfile);
    this.settingsItem = page.getByTestId(TEST_IDS.headerUserMenuSettings);
    this.themeToggle = page.getByTestId(TEST_IDS.headerThemeToggle);
  }

  async openUserMenu(): Promise<void> {
    await this.userMenuTrigger.click();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutItem.click();
    await this.page.waitForURL((url) => url.pathname === '/login', { timeout: 10_000 });
  }
}
