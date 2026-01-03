/**
 * Page Object: /admin/integrations, /admin/integrations/new, /admin/integrations/:id, /admin/integrations/webhooks
 */
import type { Locator, Page } from '@playwright/test';

export class IntegrationsListPo {
  readonly page: Page;
  readonly title: Locator;
  readonly newButton: Locator;
  readonly webhooksLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('integrations-title');
    this.newButton = page.getByTestId('integrations-new-button');
    this.webhooksLink = page.getByTestId('integrations-webhooks-link');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/integrations');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`integration-row-${id}`);
  }
}

export class IntegrationCreatePo {
  readonly page: Page;
  readonly kindSelect: Locator;
  readonly nextStep1: Locator;
  readonly nextStep2: Locator;
  readonly create: Locator;
  readonly displayName: Locator;
  readonly courseId: Locator;

  constructor(page: Page) {
    this.page = page;
    this.kindSelect = page.getByTestId('integration-wizard-kind');
    this.nextStep1 = page.getByTestId('integration-wizard-next-step1');
    this.nextStep2 = page.getByTestId('integration-wizard-next-step2');
    this.create = page.getByTestId('integration-wizard-create');
    this.displayName = page.getByTestId('integration-display-name');
    this.courseId = page.getByTestId('integration-course-id');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/integrations/new');
    await this.page.waitForLoadState('domcontentloaded');
  }

  configForm(kind: 'stepik' | 'yandex_contest' | 'manual' | 'telegram' | 'google_sheets'): Locator {
    return this.page.getByTestId(`integration-config-${kind}-form`);
  }
}

export class WebhooksAdminPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/integrations/webhooks');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`webhook-row-${id}`);
  }
}
