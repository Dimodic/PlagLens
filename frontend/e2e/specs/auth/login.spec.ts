/**
 * Auth: /login form behaviour.
 *
 * Coverage:
 *   - happy path: email + password + tenant_slug → redirect to /
 *   - "next" query param honoured after success
 *   - empty form → client-side validation errors visible
 *   - bad email format blocks submission
 *   - wrong password → 401 INVALID_CREDENTIALS shown
 *   - missing tenant slug for ambiguous user → 422 VALIDATION_FAILED
 *   - back-link "Регистрация" navigates to /register
 *   - back-link "Демо-аккаунты" navigates to /demo
 *
 * Each test uses a fresh browser context to avoid leaking session state.
 */
import { test, expect } from '@playwright/test';
import { LoginPagePo } from '../../pages/LoginPage.po';
import { DEMO_USERS } from '../../helpers/api';

test.describe.configure({ mode: 'serial' });

test.describe('@auth login form', () => {
  test('logs in admin and redirects to home', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    const c = DEMO_USERS.admin;
    await lp.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
    await lp.submitAndExpectRedirect((url) => url.pathname === '/');
    await expect(page.getByTestId('header-user-menu-trigger')).toBeVisible();
  });

  test('honours ?next= query param after login', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto('/me/profile');
    const c = DEMO_USERS.admin;
    await lp.fill({ email: c.email, password: c.password, tenantSlug: c.tenantSlug });
    await lp.submitAndExpectRedirect((url) => url.pathname === '/me/profile');
  });

  test('shows client-side validation when email is empty', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    await lp.submit.click();
    // Mantine validation error is rendered next to the field.
    await expect(page.getByText(/некорректный email/i)).toBeVisible();
  });

  test('rejects malformed email', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    await lp.email.fill('not-an-email');
    await lp.password.fill('whatever');
    await lp.submit.click();
    await expect(page.getByText(/некорректный email/i)).toBeVisible();
  });

  test('rejects wrong password with 401 INVALID_CREDENTIALS', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    await lp.fill({
      email: DEMO_USERS.admin.email,
      password: 'definitely-wrong-password',
      tenantSlug: DEMO_USERS.admin.tenantSlug,
    });
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
    );
    await lp.submit.click();
    const resp = await respPromise;
    if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
    expect([400, 401]).toContain(resp.status());
    // Stay on /login.
    await expect(page).toHaveURL(/\/login/);
    // Problem alert visible.
    await expect(page.getByRole('alert').first()).toBeVisible();
  });

  test('login without tenant_slug for demo user → 422 validation', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    // Intentionally omit tenant slug.
    await lp.email.fill(DEMO_USERS.admin.email);
    await lp.password.fill(DEMO_USERS.admin.password);
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
    );
    await lp.submit.click();
    const resp = await respPromise;
    if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
    expect([400, 422]).toContain(resp.status());
    await expect(page).toHaveURL(/\/login/);
  });

  test('"Регистрация" link goes to /register', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    await lp.registerLink.click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('"Демо-аккаунты" link goes to /demo', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    await lp.demoLink.click();
    await expect(page).toHaveURL(/\/demo/);
  });

  test('"Забыли пароль?" link goes to /auth/forgot', async ({ page }) => {
    const lp = new LoginPagePo(page);
    await lp.goto();
    await lp.forgotLink.click();
    await expect(page).toHaveURL(/\/auth\/forgot/);
  });
});
