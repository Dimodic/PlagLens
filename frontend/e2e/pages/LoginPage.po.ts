/**
 * Page Object: /login
 *
 * Encapsulates locators + actions for the LoginPage React component.
 */
import type { Locator, Page } from '@playwright/test';
import { TEST_IDS } from '../helpers/selectors';
import { inputByTestId } from '../helpers/inputs';

export class LoginPagePo {
  readonly page: Page;
  readonly email: Locator;
  readonly password: Locator;
  readonly tenantSlug: Locator;
  readonly totp: Locator;
  readonly submit: Locator;
  readonly forgotLink: Locator;
  readonly registerLink: Locator;
  readonly demoLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.email = inputByTestId(page, TEST_IDS.loginEmail);
    this.password = inputByTestId(page, TEST_IDS.loginPassword);
    this.tenantSlug = inputByTestId(page, TEST_IDS.loginTenantSlug);
    this.totp = inputByTestId(page, TEST_IDS.loginTotpCode);
    this.submit = page.getByTestId(TEST_IDS.loginSubmit);
    this.forgotLink = page.getByTestId(TEST_IDS.loginForgotLink);
    this.registerLink = page.getByTestId(TEST_IDS.loginRegisterLink);
    this.demoLink = page.getByTestId(TEST_IDS.loginDemoLink);
  }

  async goto(next?: string): Promise<void> {
    const url = next ? `/login?next=${encodeURIComponent(next)}` : '/login';
    await this.page.goto(url);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async fill(values: { email: string; password: string; tenantSlug?: string }): Promise<void> {
    await this.email.fill(values.email);
    await this.password.fill(values.password);
    if (values.tenantSlug) await this.tenantSlug.fill(values.tenantSlug);
  }

  async submitAndExpectRedirect(targetUrlPredicate: (url: URL) => boolean): Promise<void> {
    await this.submit.click();
    await this.page.waitForURL(targetUrlPredicate, { timeout: 15_000 });
  }

  async submitAndExpectStay(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (r) => r.url().includes('/auth/login') && (r.status() === 401 || r.status() === 422 || r.status() === 423),
        { timeout: 10_000 },
      ),
      this.submit.click(),
    ]);
  }

  oauthButton(provider: 'google' | 'yandex' | 'stepik' | 'github'): Locator {
    const map = {
      google: TEST_IDS.loginOauthGoogle,
      yandex: TEST_IDS.loginOauthYandex,
      stepik: TEST_IDS.loginOauthStepik,
      github: TEST_IDS.loginOauthGithub,
    } as const;
    return this.page.getByTestId(map[provider]);
  }
}
