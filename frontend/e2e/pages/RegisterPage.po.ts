/**
 * Page Object: /register
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';
import { inputByTestId } from '../helpers/inputs';

export class RegisterPagePo {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly displayName: Locator;
  readonly tenantSlug: Locator;
  readonly invitationToken: Locator;
  readonly submit: Locator;
  readonly success: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = inputByTestId(page, TEST_IDS.registerEmail);
    this.password = inputByTestId(page, TEST_IDS.registerPassword);
    this.displayName = inputByTestId(page, TEST_IDS.registerDisplayName);
    this.tenantSlug = inputByTestId(page, TEST_IDS.registerTenantSlug);
    this.invitationToken = inputByTestId(page, TEST_IDS.registerInvitationToken);
    this.submit = page.getByTestId(TEST_IDS.registerSubmit);
    this.success = page.getByTestId(TEST_IDS.registerSuccess);
  }

  async goto(): Promise<void> {
    await this.page.goto('/register');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async fillForm(values: {
    email: string;
    password: string;
    display_name: string;
    tenant_slug: string;
    invitation_token?: string;
  }): Promise<void> {
    await this.email.fill(values.email);
    await this.displayName.fill(values.display_name);
    await this.tenantSlug.fill(values.tenant_slug);
    await this.password.fill(values.password);
    if (values.invitation_token) await this.invitationToken.fill(values.invitation_token);
  }
}
