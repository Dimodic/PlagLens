/**
 * Page Object: /admin/dashboard/global (GlobalDashboardPage).
 */
import type { Locator, Page } from '@playwright/test';

export class GlobalDashboardPagePo {
  readonly page: Page;
  readonly kpisRoot: Locator;

  constructor(page: Page) {
    this.page = page;
    this.kpisRoot = page.getByTestId('global-dashboard-kpis');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/dashboard/global');
    await this.page.waitForLoadState('domcontentloaded');
  }

  kpi(name: string): Locator {
    return this.page.getByTestId(`kpi-${name}`);
  }
}
