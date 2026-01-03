/**
 * Page Objects for /admin/audit/* routes.
 */
import type { Locator, Page } from '@playwright/test';

export class AuditEventsPo {
  readonly page: Page;
  readonly actorInput: Locator;
  readonly actionInput: Locator;
  readonly resourceTypeInput: Locator;
  readonly resultSelect: Locator;
  readonly applyFilters: Locator;
  readonly resetFilters: Locator;

  constructor(page: Page) {
    this.page = page;
    this.actorInput = page.getByTestId('audit-actor-input');
    this.actionInput = page.getByTestId('audit-action-input');
    this.resourceTypeInput = page.getByTestId('audit-resource-type-input');
    this.resultSelect = page.getByTestId('audit-result-select');
    this.applyFilters = page.getByTestId('audit-apply-filters');
    this.resetFilters = page.getByTestId('audit-reset-filters');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/audit');
    await this.page.waitForLoadState('domcontentloaded');
  }

  card(id: string): Locator {
    return this.page.getByTestId(`audit-event-card-${id}`);
  }

  toggle(id: string): Locator {
    return this.page.getByTestId(`audit-event-toggle-${id}`);
  }
}

export class AuditSearchPo {
  readonly page: Page;
  readonly qInput: Locator;
  readonly actorInput: Locator;
  readonly aggToggle: Locator;
  readonly submit: Locator;
  readonly aggregationsCard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.qInput = page.getByTestId('audit-search-q-input');
    this.actorInput = page.getByTestId('audit-search-actor-input');
    this.aggToggle = page.getByTestId('audit-search-agg-toggle');
    this.submit = page.getByTestId('audit-search-submit');
    this.aggregationsCard = page.getByTestId('audit-aggregations-card');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/audit/search');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class AuditByActorPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoForUser(userId: string): Promise<void> {
    await this.page.goto(`/admin/audit/actors/${userId}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class AuditByResourcePo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async gotoForResource(type: string, id: string): Promise<void> {
    await this.page.goto(`/admin/audit/resources/${type}/${id}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class AuditAccessDeniedPo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/audit/access-denied');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class AuditRetentionPolicyPo {
  readonly page: Page;
  readonly defaultDays: Locator;
  readonly longDays: Locator;
  readonly legalHoldToggle: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.defaultDays = page.getByTestId('retention-default-days');
    this.longDays = page.getByTestId('retention-long-days');
    this.legalHoldToggle = page.getByTestId('retention-legal-hold-toggle');
    this.saveButton = page.getByTestId('retention-save-button');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/audit/retention');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class AuditLegalHoldPo {
  readonly page: Page;
  readonly title: Locator;
  readonly createButton: Locator;
  readonly resourceIdInput: Locator;
  readonly reasonInput: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('legal-holds-title');
    this.createButton = page.getByTestId('legal-hold-create-button');
    this.resourceIdInput = page.getByTestId('legal-hold-resource-id');
    this.reasonInput = page.getByTestId('legal-hold-reason');
    this.submit = page.getByTestId('legal-hold-submit');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/audit/legal-holds');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(id: string): Locator {
    return this.page.getByTestId(`hold-row-${id}`);
  }
}
