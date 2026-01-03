/**
 * Page Objects for /admin/roles, /admin/system/health, /admin/system/settings
 */
import type { Locator, Page } from '@playwright/test';

export class RolesPermissionsPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/roles');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class SystemHealthPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/system/health');
    await this.page.waitForLoadState('domcontentloaded');
  }

  card(name: string): Locator {
    return this.page.getByTestId(`service-card-${name}`);
  }
}

export class SystemSettingsPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/system/settings');
    await this.page.waitForLoadState('domcontentloaded');
  }
}
