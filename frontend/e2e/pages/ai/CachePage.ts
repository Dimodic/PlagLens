/**
 * Page Object: /admin/ai/cache — stats + purge actions.
 */
import type { Locator, Page } from '@playwright/test';

export class CachePage {
  constructor(public readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/admin/ai/cache');
  }

  get stats(): Locator {
    return this.page.getByTestId('ai-cache-stats');
  }

  get statEntries(): Locator {
    return this.page.getByTestId('ai-cache-stat-entries');
  }

  get statHitRate(): Locator {
    return this.page.getByTestId('ai-cache-stat-hit-rate');
  }

  get purgeAllButton(): Locator {
    return this.page.getByTestId('ai-cache-purge-all');
  }

  purgePromptButton(id: string): Locator {
    return this.page.getByTestId(`ai-cache-purge-prompt-${id}`);
  }

  get submissionInput(): Locator {
    return this.page.getByTestId('ai-cache-submission-input');
  }

  get purgeSubmissionButton(): Locator {
    return this.page.getByTestId('ai-cache-purge-submission');
  }
}
