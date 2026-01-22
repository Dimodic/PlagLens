/**
 * Page Object: /notifications (NotificationCenterPage).
 */
import type { Locator, Page } from '@playwright/test';

export class NotificationCenterPagePo {
  readonly page: Page;
  readonly tabUnread: Locator;
  readonly tabAll: Locator;
  readonly tabArchived: Locator;
  readonly markAllBtn: Locator;
  readonly settingsLink: Locator;
  readonly list: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabUnread = page.getByTestId('tab-unread');
    this.tabAll = page.getByTestId('tab-all');
    this.tabArchived = page.getByTestId('tab-archived');
    this.markAllBtn = page.getByTestId('mark-all-btn');
    this.settingsLink = page.getByTestId('notif-settings-link');
    this.list = page.getByTestId('notifications-list');
  }

  async goto(): Promise<void> {
    await this.page.goto('/notifications');
    await this.page.waitForLoadState('domcontentloaded');
  }

  item(id: string): Locator {
    return this.page.getByTestId(`notification-item-${id}`);
  }

  markReadBtn(id: string): Locator {
    return this.page.getByTestId(`mark-read-${id}`);
  }

  archiveBtn(id: string): Locator {
    return this.page.getByTestId(`archive-${id}`);
  }
}
