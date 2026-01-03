/**
 * Page Object: /auth/oauth/callback
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';

export class OAuthCallbackPagePo {
  readonly page: Page;
  readonly loading: Locator;

  constructor(page: Page) {
    this.page = page;
    this.loading = page.getByTestId(TEST_IDS.oauthCallbackLoading);
  }

  async gotoSuccess(returnUrl?: string): Promise<void> {
    const params = new URLSearchParams({ login: 'success' });
    if (returnUrl) params.set('return_url', returnUrl);
    await this.page.goto(`/auth/oauth/callback?${params.toString()}`);
  }

  async gotoError(error: string, description?: string): Promise<void> {
    const params = new URLSearchParams({ error });
    if (description) params.set('error_description', description);
    await this.page.goto(`/auth/oauth/callback?${params.toString()}`);
  }
}
