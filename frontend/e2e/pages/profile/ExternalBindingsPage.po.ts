/**
 * Page Object: /me/external-bindings
 */
import type { Locator, Page } from '@playwright/test';

export class ExternalBindingsPo {
  readonly page: Page;
  readonly system: Locator;
  readonly externalId: Locator;
  readonly displayName: Locator;
  readonly addSubmit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.system = page.getByTestId('bindings-add-system');
    this.externalId = page.getByTestId('bindings-add-external-id');
    this.displayName = page.getByTestId('bindings-add-display-name');
    this.addSubmit = page.getByTestId('bindings-add-submit');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/external-bindings');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`binding-row-${id}`);
  }

  removeButton(id: string): Locator {
    return this.page.getByTestId(`binding-remove-${id}`);
  }
}
