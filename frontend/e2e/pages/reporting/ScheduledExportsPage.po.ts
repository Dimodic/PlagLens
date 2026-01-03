/**
 * Page Object: /courses/:slug/scheduled-exports (ScheduledExportsPage).
 */
import type { Locator, Page } from '@playwright/test';

export class ScheduledExportsPagePo {
  readonly page: Page;
  readonly newBtn: Locator;
  readonly table: Locator;
  readonly cronInput: Locator;
  readonly submitBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.newBtn = page.getByRole('button', { name: 'Новое расписание' });
    this.table = page.getByTestId('scheduled-table');
    this.cronInput = page.getByTestId('cron-input');
    this.submitBtn = page.getByRole('button', { name: 'Создать' });
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/scheduled-exports`);
    await this.page.waitForLoadState('domcontentloaded');
    // The "Новое расписание" button is disabled until the course id resolves.
    await this.page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll('button'));
        const target = btns.find((b) => b.textContent?.trim() === 'Новое расписание');
        return !!target && !(target as HTMLButtonElement).disabled;
      },
      undefined,
      { timeout: 10_000 },
    ).catch(() => undefined);
  }

  scheduleRow(id: string): Locator {
    return this.page.getByTestId(`schedule-row-${id}`);
  }

  runNowButton(id: string): Locator {
    return this.page.getByTestId(`run-now-${id}`);
  }

  deleteButton(id: string): Locator {
    return this.page.getByTestId(`delete-schedule-${id}`);
  }
}
