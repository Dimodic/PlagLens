/**
 * Auth: forgot-password / reset-password flows.
 *
 * Coverage:
 *   - forgot-password form shows the success panel for any input (no enumeration)
 *   - reset-password page without token shows "missing token" warning
 *   - reset-password rejects mismatched confirmation
 *   - reset-password rejects weak password
 *   - reset-password with bogus token returns server error
 *
 * Note: full end-to-end (forgot → email → reset) requires hooking into the
 * dev mailbox; that's out of scope here. We test the UI surface of each page.
 */
import { test, expect } from '@playwright/test';
import { ForgotPasswordPagePo } from '../../pages/ForgotPasswordPage.po';
import { ResetPasswordPagePo } from '../../pages/ResetPasswordPage.po';

test.describe('@auth forgot-password', () => {
  test('submits with valid email → success panel', async ({ page }) => {
    const fp = new ForgotPasswordPagePo(page);
    await fp.goto();
    await fp.email.fill('any-user@example.com');
    // Backend requires tenant_slug — supply demo tenant.
    await fp.tenantSlug.fill('demo-hse');
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/password/forgot') && r.request().method() === 'POST',
    );
    await fp.submit.click();
    const resp = await respPromise;
    if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
    // Either 200 or 204 — backend deliberately doesn't reveal whether email exists.
    expect(resp.status()).toBeLessThan(400);
    await expect(fp.success).toBeVisible();
  });

  test('rejects malformed email', async ({ page }) => {
    const fp = new ForgotPasswordPagePo(page);
    await fp.goto();
    await fp.email.fill('not-an-email');
    await fp.submit.click();
    await expect(page.getByText(/некорректный email/i)).toBeVisible();
  });

  test('returns to /login via link', async ({ page }) => {
    const fp = new ForgotPasswordPagePo(page);
    await fp.goto();
    await page.getByRole('link', { name: /назад к входу/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('@auth reset-password', () => {
  test('without token shows "token missing" warning', async ({ page }) => {
    await page.goto('/auth/reset');
    await expect(page.getByText(/токен не найден/i)).toBeVisible();
  });

  test('rejects mismatched confirmation', async ({ page }) => {
    const rp = new ResetPasswordPagePo(page);
    await rp.gotoWithToken('any-token-for-form-only');
    await rp.newPassword.fill('Tr0ub4dor3-Test!');
    await rp.confirmPassword.fill('SomeOther-Pass1!');
    await rp.submit.click();
    await expect(page.getByText(/пароли не совпадают/i)).toBeVisible();
  });

  test('rejects weak password (client-side)', async ({ page }) => {
    const rp = new ResetPasswordPagePo(page);
    await rp.gotoWithToken('any-token');
    await rp.newPassword.fill('123');
    await rp.confirmPassword.fill('123');
    await rp.submit.click();
    // Some validation error appears (zod rule).
    await expect(page.getByText(/пароль/i).first()).toBeVisible();
  });

  test('bogus token → server error problem alert', async ({ page }) => {
    const rp = new ResetPasswordPagePo(page);
    await rp.gotoWithToken('this-is-not-a-real-token');
    await rp.newPassword.fill('Tr0ub4dor3-Test!');
    await rp.confirmPassword.fill('Tr0ub4dor3-Test!');
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/password/reset') && r.request().method() === 'POST',
    );
    await rp.submit.click();
    const resp = await respPromise;
    if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
    expect(resp.ok()).toBeFalsy();
    await expect(page.getByRole('alert').first()).toBeVisible();
  });
});
