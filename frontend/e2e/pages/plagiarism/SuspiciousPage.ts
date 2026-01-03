/**
 * Page Object: /courses/:slug/suspicious — flagged submissions list.
 */
import type { Locator, Page } from '@playwright/test';

export class SuspiciousPage {
  constructor(public readonly page: Page) {}

  async open(courseSlug: string): Promise<void> {
    await this.page.goto(`/courses/${courseSlug}/suspicious`);
  }

  get table(): Locator {
    return this.page.getByTestId('suspicious-table');
  }

  get severityFilter(): Locator {
    return this.page.getByTestId('suspicious-severity-filter');
  }

  get dismissedFilter(): Locator {
    return this.page.getByTestId('suspicious-dismissed-filter');
  }

  row(flagId: string): Locator {
    return this.page.getByTestId(`suspicious-row-${flagId}`);
  }

  rowSeverity(flagId: string): Locator {
    return this.page.getByTestId(`suspicious-row-${flagId}-severity`);
  }

  rowBumpButton(flagId: string): Locator {
    return this.page.getByTestId(`suspicious-row-${flagId}-bump`);
  }

  rowDismissButton(flagId: string): Locator {
    return this.page.getByTestId(`suspicious-row-${flagId}-dismiss`);
  }

  async pickSeverity(severity: 'all' | 'low' | 'medium' | 'high'): Promise<void> {
    const labelByValue: Record<string, string | RegExp> = {
      all: /Все/,
      low: 'low',
      medium: 'medium',
      high: 'high',
    };
    await this.severityFilter.click();
    await this.page
      .getByRole('option', { name: labelByValue[severity] })
      .first()
      .click();
  }
}
