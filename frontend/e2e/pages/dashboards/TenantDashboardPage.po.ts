/**
 * Page Object: /admin (TenantDashboardPage).
 */
import type { Locator, Page } from '@playwright/test';

export class TenantDashboardPagePo {
  readonly page: Page;
  readonly kpisRoot: Locator;

  constructor(page: Page) {
    this.page = page;
    this.kpisRoot = page.getByTestId('tenant-dashboard-kpis');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin');
    await this.page.waitForLoadState('domcontentloaded');
  }

  kpi(name: string): Locator {
    return this.page.getByTestId(`kpi-${name}`);
  }

  integrationRow(name: string): Locator {
    return this.page.getByTestId(`integration-${name}`);
  }
}
