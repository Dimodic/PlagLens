/**
 * Page Object: /admin/ai/budgets — usage meters + limits editor.
 */
import type { Locator, Page } from '@playwright/test';

export class BudgetsPage {
  constructor(public readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/admin/ai/budgets');
  }

  get tokensMeter(): Locator {
    return this.page.getByTestId('usage-meter-tokens');
  }

  get costMeter(): Locator {
    return this.page.getByTestId('usage-meter-cost');
  }

  get tokensPct(): Locator {
    return this.page.getByTestId('usage-meter-tokens-pct');
  }
}
