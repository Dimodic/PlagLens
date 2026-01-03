/**
 * Page Object: /me/api-keys
 */
import type { Locator, Page } from '@playwright/test';

export class ApiKeysPo {
  readonly page: Page;
  readonly createButton: Locator;
  readonly nameInput: Locator;
  readonly scopesSelect: Locator;
  readonly createSubmit: Locator;
  readonly modalKey: Locator;
  readonly copyButton: Locator;
  readonly modalDone: Locator;
  readonly onceWarning: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createButton = page.getByRole('button', { name: 'Создать' }).first();
    this.nameInput = page.getByTestId('api-key-name-input');
    this.scopesSelect = page.getByTestId('api-key-scopes-select');
    this.createSubmit = page.getByTestId('api-key-create-submit');
    this.modalKey = page.getByTestId('api-key-modal-key');
    this.copyButton = page.getByTestId('api-key-copy-button');
    this.modalDone = page.getByTestId('api-key-modal-done');
    this.onceWarning = page.getByTestId('api-key-once-warning');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/api-keys');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`api-key-row-${id}`);
  }
}
