/**
 * Page Object: /courses/:slug/exports (CourseExportsPage).
 */
import type { Locator, Page } from '@playwright/test';

export class CourseExportsPagePo {
  readonly page: Page;
  readonly newBtn: Locator;
  readonly table: Locator;
  readonly modal: Locator;
  readonly form: Locator;
  readonly submitBtn: Locator;
  readonly kindSelect: Locator;
  readonly formatSelect: Locator;
  readonly scopeInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newBtn = page.getByRole('button', { name: 'Новый экспорт' });
    this.table = page.getByTestId('course-exports-table');
    this.modal = page.getByTestId('export-create-modal');
    this.form = page.getByTestId('export-create-form');
    this.submitBtn = page.getByTestId('export-submit-btn');
    this.kindSelect = page.getByTestId('export-kind-select');
    this.formatSelect = page.getByTestId('export-format-select');
    this.scopeInput = page.getByTestId('export-scope-input');
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/exports`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  exportRow(id: string): Locator {
    return this.page.getByTestId(`export-row-${id}`);
  }

  downloadButton(id: string): Locator {
    return this.page.getByTestId(`download-${id}`);
  }

  async openCreateModal(): Promise<void> {
    // The "Новый экспорт" button is disabled until the course finishes loading
    // (we need course.id to scope the create). Wait for it to be enabled.
    await this.newBtn.waitFor({ state: 'visible' });
    await this.page.waitForFunction(
      () =>
        !document.querySelector<HTMLButtonElement>(
          'button:not([disabled])',
        ) === false,
      undefined,
      { timeout: 5_000 },
    ).catch(() => undefined);
    // Click only when enabled.
    const btn = this.newBtn;
    for (let i = 0; i < 20; i += 1) {
      const disabled = await btn.getAttribute('disabled');
      if (disabled === null) break;
      await this.page.waitForTimeout(250);
    }
    await btn.click();
    // The modal title is present once the modal has portaled in.
    await this.page
      .getByRole('dialog', { name: 'Создать экспорт' })
      .waitFor({ state: 'visible', timeout: 10_000 });
  }

  async pickKind(name: string): Promise<void> {
    await this.kindSelect.click();
    await this.page.getByRole('option', { name }).first().click();
  }

  async pickFormat(name: string): Promise<void> {
    await this.formatSelect.click();
    await this.page.getByRole('option', { name }).first().click();
  }
}
