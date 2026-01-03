/**
 * Page Object: /admin/ai/providers — providers list + edit modal.
 */
import type { Locator, Page } from '@playwright/test';

export class LLMProvidersPage {
  constructor(public readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/admin/ai/providers');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`provider-row-${id}`);
  }

  toggle(id: string): Locator {
    // Mantine Switch — data-testid lands on the inner <input>. We expose it
    // for state checks (toBeChecked); clicks should target the parent label
    // (visible track) instead.
    return this.page
      .locator(
        `input[data-testid="provider-row-${id}-toggle"], [data-testid="provider-row-${id}-toggle"] input`,
      )
      .first();
  }

  toggleTrack(id: string): Locator {
    // Visible Switch wrapper — use this for clicks.
    return this.page
      .locator(
        `input[data-testid="provider-row-${id}-toggle"]`,
      )
      .locator('xpath=ancestor::*[contains(@class,"mantine-Switch-root")][1]');
  }

  editButton(id: string): Locator {
    return this.page.getByTestId(`provider-row-${id}-edit`);
  }

  testButton(id: string): Locator {
    return this.page.getByTestId(`provider-row-${id}-test`);
  }

  get editModal(): Locator {
    return this.page.getByTestId('provider-edit-modal');
  }

  get editBaseUrl(): Locator {
    return this.page
      .locator(
        'input[data-testid="provider-edit-base-url"], [data-testid="provider-edit-base-url"] input',
      )
      .first();
  }

  get editModel(): Locator {
    return this.page
      .locator(
        'input[data-testid="provider-edit-model"], [data-testid="provider-edit-model"] input',
      )
      .first();
  }

  get editApiKeyEnv(): Locator {
    return this.page
      .locator(
        'input[data-testid="provider-edit-api-key-env"], [data-testid="provider-edit-api-key-env"] input',
      )
      .first();
  }

  get editSave(): Locator {
    return this.page.getByTestId('provider-edit-save');
  }
}
