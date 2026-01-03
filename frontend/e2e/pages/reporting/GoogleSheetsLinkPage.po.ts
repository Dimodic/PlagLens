/**
 * Page Object: /courses/:slug/google-sheets (GoogleSheetsLinkPage).
 */
import type { Locator, Page } from '@playwright/test';

export class GoogleSheetsLinkPagePo {
  readonly page: Page;
  readonly spreadsheetIdInput: Locator;
  readonly sheetNameInput: Locator;
  readonly columnsMappingInput: Locator;
  readonly saveBtn: Locator;
  readonly syncBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.spreadsheetIdInput = page.getByTestId('spreadsheet-id');
    this.sheetNameInput = page.getByTestId('sheet-name');
    this.columnsMappingInput = page.getByTestId('columns-mapping');
    this.saveBtn = page.getByRole('button', { name: 'Сохранить' });
    this.syncBtn = page.getByTestId('manual-sync-btn');
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/google-sheets`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
