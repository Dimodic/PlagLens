/**
 * Page Object: /admin/notifications/{email,templates,deliveries,dlq}
 */
import type { Locator, Page } from '@playwright/test';

export class EmailConfigPo {
  readonly page: Page;
  readonly transport: Locator;
  readonly fromEmail: Locator;
  readonly fromName: Locator;
  readonly testButton: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.transport = page.getByTestId('email-transport-select');
    this.fromEmail = page.getByTestId('email-from-email-input');
    this.fromName = page.getByTestId('email-from-name-input');
    this.testButton = page.getByTestId('email-test-button');
    this.saveButton = page.getByTestId('email-save-button');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/notifications/email');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class NotificationTemplatesPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/notifications/templates');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`template-row-${id}`);
  }
}

export class NotificationDeliveriesPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/notifications/deliveries');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`delivery-row-${id}`);
  }
}

export class NotificationDLQPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/notifications/dlq');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`dlq-row-${id}`);
  }
}
