/**
 * Page Object: /admin/users, /admin/users/new, /admin/users/:id
 */
import type { Locator, Page } from '@playwright/test';

export class UsersListPo {
  readonly page: Page;
  readonly title: Locator;
  readonly newButton: Locator;
  readonly search: Locator;
  readonly roleFilter: Locator;
  readonly statusFilter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId('users-title');
    this.newButton = page.getByTestId('users-new-button');
    this.search = page.getByTestId('users-search-input');
    this.roleFilter = page.getByTestId('users-role-filter');
    this.statusFilter = page.getByTestId('users-status-filter');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/users');
    await this.page.waitForLoadState('domcontentloaded');
  }

  row(email: string): Locator {
    return this.page.getByTestId(`user-row-${email}`);
  }

  actionsTrigger(email: string): Locator {
    return this.page.getByTestId(`user-actions-trigger-${email}`);
  }

  actionView(email: string): Locator {
    return this.page.getByTestId(`user-action-view-${email}`);
  }

  actionDisable(email: string): Locator {
    return this.page.getByTestId(`user-action-disable-${email}`);
  }

  actionEnable(email: string): Locator {
    return this.page.getByTestId(`user-action-enable-${email}`);
  }

  actionAnonymize(email: string): Locator {
    return this.page.getByTestId(`user-action-anonymize-${email}`);
  }

  actionResetPassword(email: string): Locator {
    return this.page.getByTestId(`user-action-reset-password-${email}`);
  }

  actionForceLogout(email: string): Locator {
    return this.page.getByTestId(`user-action-force-logout-${email}`);
  }
}

export class UserCreatePo {
  readonly page: Page;
  readonly tabSingle: Locator;
  readonly tabBulk: Locator;
  readonly emailInput: Locator;
  readonly nameInput: Locator;
  readonly roleSelect: Locator;
  readonly submit: Locator;
  readonly bulkEmails: Locator;
  readonly bulkRole: Locator;
  readonly bulkSubmit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabSingle = page.getByTestId('user-create-tab-single');
    this.tabBulk = page.getByTestId('user-create-tab-bulk');
    this.emailInput = page.getByTestId('user-create-email');
    this.nameInput = page.getByTestId('user-create-name');
    this.roleSelect = page.getByTestId('user-create-role');
    this.submit = page.getByTestId('user-create-submit');
    this.bulkEmails = page.getByTestId('user-bulk-emails');
    this.bulkRole = page.getByTestId('user-bulk-role');
    this.bulkSubmit = page.getByTestId('user-bulk-submit');
  }

  async goto(): Promise<void> {
    await this.page.goto('/admin/users/new');
    await this.page.waitForLoadState('domcontentloaded');
  }
}

export class UserDetailPo {
  readonly page: Page;
  readonly tabProfile: Locator;
  readonly tabBindings: Locator;
  readonly tabOAuth: Locator;
  readonly tabSessions: Locator;
  readonly tabAudit: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabProfile = page.getByTestId('user-tab-profile');
    this.tabBindings = page.getByTestId('user-tab-bindings');
    this.tabOAuth = page.getByTestId('user-tab-oauth');
    this.tabSessions = page.getByTestId('user-tab-sessions');
    this.tabAudit = page.getByTestId('user-tab-audit');
    this.saveButton = page.getByTestId('user-detail-save');
  }

  async gotoById(id: string): Promise<void> {
    await this.page.goto(`/admin/users/${id}`);
    await this.page.waitForLoadState('domcontentloaded');
  }
}
