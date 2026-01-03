/**
 * Page Object: /admin/tenants and /admin/tenants/new and /admin/tenants/:id
 */
import type { Locator, Page } from '@playwright/test';

export class TenantsListPo {
  readonly page: Page;
  readonly title: Locator;
  readonly newButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('tenants-title');
    this.newButton = page.getByTestId('tenants-new-button');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/tenants');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(slug: string): Locator {
    return this.page.getByTestId(`tenant-row-${slug}`);
  }

  openButton(slug: string): Locator {
    return this.page.getByTestId(`tenant-open-${slug}`);
  }
}

export class TenantCreatePo {
  readonly page: Page;
  readonly slug: Locator;
  readonly name: Locator;
  readonly domain: Locator;
  readonly cors: Locator;
  readonly submit: Locator;
  readonly cancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.slug = page.getByTestId('tenant-create-slug');
    this.name = page.getByTestId('tenant-create-name');
    this.domain = page.getByTestId('tenant-create-domain');
    this.cors = page.getByTestId('tenant-create-cors');
    this.submit = page.getByTestId('tenant-create-submit');
    this.cancel = page.getByTestId('tenant-create-cancel');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/tenants/new');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async fillAndSubmit(values: { slug: string; name: string; domain?: string }): Promise<void> {
    await this.slug.fill(values.slug);
    await this.name.fill(values.name);
    if (values.domain) await this.domain.fill(values.domain);
    await this.submit.click();
  }
}

export class TenantDetailPo {
  readonly page: Page;
  readonly title: Locator;
  readonly statusBadge: Locator;
  readonly suspendButton: Locator;
  readonly activateButton: Locator;
  readonly tabSettings: Locator;
  readonly tabUsers: Locator;
  readonly tabUsage: Locator;
  readonly tabAudit: Locator;
  readonly corsInput: Locator;
  readonly defaultProviderInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('tenant-detail-title');
    this.statusBadge = page.getByTestId('tenant-status-badge');
    this.suspendButton = page.getByTestId('tenant-suspend-button');
    this.activateButton = page.getByTestId('tenant-activate-button');
    this.tabSettings = page.getByTestId('tenant-tab-settings');
    this.tabUsers = page.getByTestId('tenant-tab-users');
    this.tabUsage = page.getByTestId('tenant-tab-usage');
    this.tabAudit = page.getByTestId('tenant-tab-audit');
    this.corsInput = page.getByTestId('tenant-cors-input');
    this.defaultProviderInput = page.getByTestId('tenant-default-provider-input');
    this.saveButton = page.getByTestId('tenant-save-button');
  }

  async gotoById(id: string): Promise<void> {
    await this.page.goto(`/admin/tenants/${id}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
