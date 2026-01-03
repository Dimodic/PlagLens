/**
 * Auth helpers for E2E tests — UI login flow and seeded session restore.
 *
 * Why two strategies:
 *   - For tests that exercise the login UI itself, drive the form (uiLoginAs).
 *   - For all other domains, prefer fast cookie/storage restore via fixtures
 *     (see setup/fixtures.ts) — saves ~1.5s per test.
 */
import type { Page } from '@playwright/test';
import { TEST_IDS } from './selectors';
import { DEMO_USERS, type DemoRole } from './api';

/**
 * Drive the /login form: type credentials, submit, wait for redirect to /.
 * Throws if redirect doesn't happen within timeout.
 */
export async function uiLoginAs(page: Page, role: DemoRole): Promise<void> {
  const c = DEMO_USERS[role];
  await page.goto('/login');
  await page.getByTestId(TEST_IDS.loginEmail).fill(c.email);
  await page.getByTestId(TEST_IDS.loginPassword).fill(c.password);
  if (c.tenantSlug) {
    await page.getByTestId(TEST_IDS.loginTenantSlug).fill(c.tenantSlug);
  }
  await page.getByTestId(TEST_IDS.loginSubmit).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

/**
 * Click the corresponding Demo login card. Faster + simpler than the full form
 * because the page hard-codes the credentials and tenant.
 */
export async function demoLoginAs(page: Page, role: DemoRole): Promise<void> {
  await page.goto('/demo');
  // The demo page lays out a card per role with a "Войти" button.
  // We rely on data-testid that we add to the React component.
  await page.getByTestId(TEST_IDS.demoLoginButton(role)).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 15_000 });
}

/**
 * Logout via the user menu. Verifies redirect to /login.
 */
export async function uiLogout(page: Page): Promise<void> {
  await page.getByTestId(TEST_IDS.headerUserMenuTrigger).click();
  await page.getByTestId(TEST_IDS.headerUserMenuLogout).click();
  await page.waitForURL((url) => url.pathname === '/login', { timeout: 10_000 });
}
