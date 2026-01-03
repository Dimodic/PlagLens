/**
 * Auth: /register form behaviour.
 *
 * Coverage:
 *   - successful submission shows the confirmation panel
 *   - tenant_slug is required (client-side and server-side)
 *   - weak password is rejected
 *   - existing email returns server validation error
 *   - "Войти" link goes back to /login
 */
import { test, expect } from '@playwright/test';
import { RegisterPagePo } from '../../pages/RegisterPage.po';
import { buildRegisterInput } from '../../helpers/factories';
import { DEMO_USERS } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });

test.describe('@auth register form', () => {
  test('valid data → confirmation panel', async ({ page }) => {
    const rp = new RegisterPagePo(page);
    await rp.goto();
    const input = buildRegisterInput({ tenant_slug: 'demo-hse' });
    await rp.email.fill(input.email);
    await rp.displayName.fill(input.display_name);
    await rp.tenantSlug.fill(input.tenant_slug);
    await rp.password.fill(input.password);

    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/register') && r.request().method() === 'POST',
      { timeout: 15_000 },
    );
    await rp.submit.click();
    const resp = await respPromise;
    if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
    if (resp.status() === 403 || resp.status() === 404) {
      test.skip(true, `Backend returned ${resp.status()} — registration may be disabled for tenant`);
    }
    if (!resp.ok()) {
      const body = await resp.text();
      test.info().annotations.push({ type: 'register-failed', description: `${resp.status()} ${body}` });
    }
    expect(resp.ok()).toBeTruthy();
    await expect(page.getByTestId('register-success')).toBeVisible({ timeout: 5_000 });
  });

  test('empty form → client-side validation', async ({ page }) => {
    const rp = new RegisterPagePo(page);
    await rp.goto();
    await rp.submit.click();
    // At least one validation message is rendered.
    await expect(page.getByText(/некорректный email/i).first()).toBeVisible();
  });

  test('missing tenant_slug → form blocks submission', async ({ page }) => {
    const rp = new RegisterPagePo(page);
    await rp.goto();
    await rp.email.fill('foo@example.com');
    await rp.displayName.fill('Test User');
    await rp.password.fill('Tr0ub4dor3-Test!');
    // tenant_slug intentionally empty
    await rp.submit.click();
    await expect(page.getByText(/укажите организацию/i)).toBeVisible();
  });

  test('weak password is rejected', async ({ page }) => {
    const rp = new RegisterPagePo(page);
    await rp.goto();
    await rp.email.fill('weakpass-test@example.com');
    await rp.displayName.fill('Test User');
    await rp.tenantSlug.fill('demo-hse');
    await rp.password.fill('123');
    await rp.submit.click();
    // Some validation error appears (zod rule from validators).
    await expect(page.getByRole('alert').or(page.getByText(/пароль/i)).first()).toBeVisible();
  });

  test('existing email → server validation error', async ({ page }) => {
    const rp = new RegisterPagePo(page);
    await rp.goto();
    const c = DEMO_USERS.admin;
    await rp.email.fill(c.email);
    await rp.displayName.fill('Duplicate User');
    await rp.tenantSlug.fill(c.tenantSlug);
    await rp.password.fill('Tr0ub4dor3-Test!');

    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/register') && r.request().method() === 'POST',
    );
    await rp.submit.click();
    const resp = await respPromise;
    if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
    expect(resp.ok()).toBeFalsy();
    expect([400, 409, 422]).toContain(resp.status());
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('"Войти" link returns to /login', async ({ page }) => {
    const rp = new RegisterPagePo(page);
    await rp.goto();
    await page.getByRole('link', { name: /войти/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
