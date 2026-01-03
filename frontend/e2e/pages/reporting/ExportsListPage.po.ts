/**
 * Page Object: /me/exports + /admin/exports (ExportsListPage).
 */
import type { Locator, Page } from '@playwright/test';

export class ExportsListPagePo {
  readonly page: Page;
  readonly newExportBtn: Locator;
  readonly statusFilter: Locator;
  readonly table: Locator;
  readonly modal: Locator;
  readonly form: Locator;
  readonly kindSelect: Locator;
  readonly formatSelect: Locator;
  readonly anonymizeToggle: Locator;
  readonly scopeInput: Locator;
  readonly submitBtn: Locator;
  readonly cancelBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newExportBtn = page.getByRole('button', { name: 'Новый экспорт' });
    this.statusFilter = page.getByTestId('status-filter');
    this.table = page.getByTestId('exports-table');
    this.modal = page.getByTestId('export-create-modal');
    this.form = page.getByTestId('export-create-form');
    this.kindSelect = page.getByTestId('export-kind-select');
    this.formatSelect = page.getByTestId('export-format-select');
    this.anonymizeToggle = page.getByTestId('export-anonymize-toggle');
    this.scopeInput = page.getByTestId('export-scope-input');
    this.submitBtn = page.getByTestId('export-submit-btn');
    this.cancelBtn = page.getByTestId('export-cancel-btn');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/exports');
    await this.page.waitForLoadState('domcontentloaded');
  }

  exportRow(id: string): Locator {
    return this.page.getByTestId(`export-row-${id}`);
  }

  downloadButton(id: string): Locator {
    return this.page.getByTestId(`download-${id}`);
  }

  retryButton(id: string): Locator {
    return this.page.getByTestId(`retry-${id}`);
  }

  cancelButton(id: string): Locator {
    return this.page.getByTestId(`cancel-${id}`);
  }

  async openCreateModal(): Promise<void> {
    await this.newExportBtn.click();
    // The Mantine v7 Modal portals its dialog; wait on the dialog role
    // (which carries the title) instead of the testid'd root container,
    // which remains in the tree even when closed.
    await this.page
      .getByRole('dialog', { name: 'Создать экспорт' })
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  async pickKind(value: string): Promise<void> {
    // Mantine Select renders an input we can click and choose option text.
    await this.kindSelect.click();
    await this.page.getByRole('option', { name: value, exact: false }).first().click();
  }

  async pickFormat(value: string): Promise<void> {
    await this.formatSelect.click();
    await this.page.getByRole('option', { name: value, exact: false }).first().click();
  }
}
