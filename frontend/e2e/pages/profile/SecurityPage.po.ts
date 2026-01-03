/**
 * Page Object: /me/security — password / 2FA / OAuth / sessions tabs.
 */
import type { Locator, Page } from '@playwright/test';

export class SecurityPo {
  readonly page: Page;
  // Password tab
  readonly passwordCurrent: Locator;
  readonly passwordNew: Locator;
  readonly passwordConfirm: Locator;
  readonly passwordSubmit: Locator;
  // 2FA tab
  readonly twoFaEnrollStart: Locator;
  readonly twoFaQr: Locator;
  readonly twoFaOtpAuthUri: Locator;
  readonly twoFaCodeInput: Locator;
  readonly twoFaConfirmEnroll: Locator;
  readonly twoFaEnabled: Locator;
  readonly twoFaDisablePassword: Locator;
  readonly twoFaDisableSubmit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.passwordCurrent = page.getByTestId('profile-password-current');
    this.passwordNew = page.getByTestId('profile-password-new');
    this.passwordConfirm = page.getByTestId('profile-password-confirm');
    this.passwordSubmit = page.getByTestId('profile-password-submit');

    this.twoFaEnrollStart = page.getByTestId('profile-2fa-enroll-start');
    this.twoFaQr = page.getByTestId('profile-2fa-qr');
    this.twoFaOtpAuthUri = page.getByTestId('profile-2fa-otpauth-uri');
    this.twoFaCodeInput = page.getByTestId('profile-2fa-code-input');
    this.twoFaConfirmEnroll = page.getByTestId('profile-2fa-confirm-enroll');
    this.twoFaEnabled = page.getByTestId('profile-2fa-enabled');
    this.twoFaDisablePassword = page.getByTestId('profile-2fa-disable-password');
    this.twoFaDisableSubmit = page.getByTestId('profile-2fa-disable-submit');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me/security');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openTab(value: 'password' | '2fa' | 'oauth' | 'sessions'): Promise<void> {
    // Mantine Tabs renders all tabs as buttons with role="tab"; find by visible text.
    const labels = {
      password: 'Password',
      '2fa': '2FA',
      oauth: 'OAuth',
      sessions: 'Sessions',
    } as const;
    await this.page.getByRole('tab', { name: labels[value] }).click();
  }

  oauthLinkButton(provider: 'google' | 'yandex' | 'stepik' | 'github'): Locator {
    return this.page.getByTestId(`oauth-link-${provider}`);
  }

  oauthUnlinkButton(provider: 'google' | 'yandex' | 'stepik' | 'github'): Locator {
    return this.page.getByTestId(`oauth-unlink-${provider}`);
  }

  sessionRow(id: string): Locator {
    return this.page.getByTestId(`session-row-${id}`);
  }
}
