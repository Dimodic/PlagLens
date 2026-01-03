/**
 * Page Object: /me/notifications/web-push (WebPushSettingsPage).
 */
import type { Locator, Page } from '@playwright/test';

export class WebPushSettingsPagePo {
  readonly page: Page;
  readonly subscribeBtn: Locator;
  readonly unsubscribeBtn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.subscribeBtn = page.getByTestId('subscribe-btn');
    this.unsubscribeBtn = page.getByTestId('unsubscribe-btn');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/notifications/web-push');
    await this.page.waitForLoadState('domcontentloaded');
  }
}
