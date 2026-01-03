/**
 * Page Object: /demo
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';
import type { DemoRole } from '../helpers/api';

export class DemoLoginPagePo {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.goto('/demo');
    await this.page.waitForLoadState('domcontentloaded');
  }

  // The DemoLoginPage exposes 3 cards keyed by role-suffixed test-id:
  //   admin → admin, teacher → teacher, student1 → student1
  // The remaining seed accounts (assistant, student2..4) are only reachable
  // through /login with their explicit credentials.
  card(role: DemoRole): Locator {
    return this.page.getByTestId(TEST_IDS.demoCard(role));
  }

  loginButton(role: DemoRole): Locator {
    return this.page.getByTestId(TEST_IDS.demoLoginButton(role));
  }

  async loginAs(role: DemoRole): Promise<void> {
    await this.loginButton(role).click();
    await this.page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 15_000 });
  }
}
