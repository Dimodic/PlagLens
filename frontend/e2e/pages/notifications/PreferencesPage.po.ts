/**
 * Page Object: /me/notifications/preferences (PreferencesPage).
 */
import type { Locator, Page } from '@playwright/test';

export class PreferencesPagePo {
  readonly page: Page;
  readonly chInapp: Locator;
  readonly chEmail: Locator;
  readonly chTelegram: Locator;
  readonly digestSelect: Locator;
  readonly resetBtn: Locator;
  readonly saveBtn: Locator;
  readonly matrix: Locator;
  readonly testInapp: Locator;
  readonly testEmail: Locator;

  constructor(page: Page) {
    this.page = page;
    this.chInapp = page.getByTestId('ch-inapp');
    this.chEmail = page.getByTestId('ch-email');
    this.chTelegram = page.getByTestId('ch-telegram');
    this.digestSelect = page.getByTestId('digest-select');
    this.resetBtn = page.getByTestId('reset-btn');
    this.saveBtn = page.getByTestId('save-btn');
    this.matrix = page.getByTestId('preferences-matrix');
    this.testInapp = page.getByTestId('test-inapp');
    this.testEmail = page.getByTestId('test-email');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/notifications/preferences');
    await this.page.waitForLoadState('domcontentloaded');
  }

  matrixCell(eventType: string, channel: 'inapp' | 'email' | 'telegram'): Locator {
    return this.page.getByTestId(`pref-${eventType}-${channel}`);
  }
}
