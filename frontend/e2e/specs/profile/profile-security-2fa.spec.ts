/**
 * /me/security — 2FA enrollment / disable.
 *
 * Note: We don't have speakeasy in deps, but the enroll endpoint returns the
 * secret + otpauth_uri. We can extract the secret from the URI and either:
 *   1. Compute the TOTP code via the Web Crypto API (browser-side).
 *   2. Submit a known-bogus code and assert the API rejects it.
 */
import { test, expect } from '../../setup/fixtures';
import { SecurityPo } from '../../pages/profile/SecurityPage.po';

test.describe('Profile security — 2FA', () => {
  test('teacher opens 2FA tab and sees enroll button OR disabled state', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('2fa');
    // Either we see "Включить 2FA" or "2FA включена".
    const enroll = po.twoFaEnrollStart;
    const enabled = po.twoFaEnabled;
    const enrollVisible = await enroll.isVisible({ timeout: 5_000 }).catch(() => false);
    const enabledVisible = await enabled.isVisible({ timeout: 5_000 }).catch(() => false);
    expect(enrollVisible || enabledVisible).toBeTruthy();
  });

  test('clicking enroll renders QR area with otpauth_uri', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('2fa');
    if (await po.twoFaEnrollStart.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await po.twoFaEnrollStart.click();
      await expect(po.twoFaQr).toBeVisible({ timeout: 10_000 });
      await expect(po.twoFaOtpAuthUri).toBeVisible();
      const uri = await po.twoFaOtpAuthUri.textContent();
      expect(uri).toMatch(/otpauth:\/\/totp/);
      // Confirm input is visible.
      await expect(po.twoFaCodeInput).toBeVisible();
    } else {
      // Already enabled — skip.
      test.skip();
    }
  });

  test('submitting a clearly invalid TOTP code shows a toast/error', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('2fa');
    if (await po.twoFaEnrollStart.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await po.twoFaEnrollStart.click();
      await expect(po.twoFaCodeInput).toBeVisible({ timeout: 10_000 });
      await po.twoFaCodeInput.fill('000000');
      await po.twoFaConfirmEnroll.click();
      await expect(
        teacherPage.locator('.mantine-Notification-root, [role="alert"]').first(),
      ).toBeVisible({ timeout: 10_000 });
    } else {
      test.skip();
    }
  });

  test('disable form requires password (visible to enabled users)', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('2fa');
    if (await po.twoFaEnabled.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(po.twoFaDisablePassword).toBeVisible();
      await expect(po.twoFaDisableSubmit).toBeVisible();
    } else {
      test.skip();
    }
  });
});
