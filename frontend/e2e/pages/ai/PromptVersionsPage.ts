/**
 * Page Object: /admin/ai/prompt-versions — list, activate, sandbox-test.
 */
import type { Locator, Page } from '@playwright/test';

export class PromptVersionsPage {
  constructor(public readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/admin/ai/prompt-versions');
  }

  get list(): Locator {
    return this.page.getByTestId('prompt-versions-list');
  }

  card(id: string): Locator {
    return this.page.getByTestId(`prompt-version-card-${id}`);
  }

  openButton(id: string): Locator {
    return this.page.getByTestId(`prompt-version-open-${id}`);
  }

  activateButton(id: string): Locator {
    return this.page.getByTestId(`prompt-version-activate-${id}`);
  }

  get sandboxCode(): Locator {
    // Mantine Textarea forwards data-testid to the inner <textarea>.
    return this.page
      .locator(
        'textarea[data-testid="prompt-sandbox-code"], [data-testid="prompt-sandbox-code"] textarea',
      )
      .first();
  }

  get sandboxRun(): Locator {
    return this.page.getByTestId('prompt-sandbox-run');
  }

  get sandboxResult(): Locator {
    return this.page.getByTestId('prompt-sandbox-result');
  }
}
