/**
 * Custom Playwright fixtures.
 *
 * Usage:
 *   import { test, expect } from '../setup/fixtures';
 *   test('teacher can do X', async ({ teacherPage }) => { ... });
 *
 * Fixtures provided:
 *   apiClient    — pre-authed ApiClient (admin)
 *   adminPage    — Page logged in as admin@demo.local
 *   teacherPage  — Page logged in as teacher@demo.local
 *   studentPage  — Page logged in as student1@demo.local
 *   uniqueSlug   — random unique string (per-test)
 */
import { test as base, type Page } from '@playwright/test';
import { ApiClient, DEMO_USERS, type DemoRole } from '../helpers/api';
import { uniqueSlug } from '../helpers/factories';

interface CustomFixtures {
  apiClient: ApiClient;
  adminPage: Page;
  teacherPage: Page;
  assistantPage: Page;
  studentPage: Page;
  uniqueSlug: string;
}

/**
 * Drives the /login form via UI to populate session cookies, then returns
 * the page. We use the form path (not API) because the AuthProvider relies
 * on the bootstrap /auth/refresh + httpOnly refresh cookie set by the
 * server — driving the form is the cleanest way to reproduce that.
 */
async function loginPageAs(page: Page, role: DemoRole): Promise<void> {
  const c = DEMO_USERS[role];
  await page.goto('/login');
  // Wait for the form to mount.
  await page.waitForLoadState('domcontentloaded');
  // Mantine wraps inputs — match either the input directly or descend into the wrapper.
  const fillByTestId = async (testId: string, value: string) => {
    const input = page
      .locator(`[data-testid="${testId}"]`)
      .locator('input, textarea')
      .first();
    if ((await input.count()) > 0) {
      await input.fill(value);
    } else {
      await page.getByTestId(testId).fill(value);
    }
  };
  await fillByTestId('login-email', c.email);
  await fillByTestId('login-password', c.password);
  if (c.tenantSlug) {
    await fillByTestId('login-tenant-slug', c.tenantSlug);
  }
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), {
    timeout: 15_000,
  });
}

/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern --
   Playwright fixtures legitimately destructure `({}, use)` and call `use(...)`.
   ESLint mistakes the lowercase fixture names + `use` call for a React hook. */
export const test = base.extend<CustomFixtures>({
  apiClient: async ({}, use) => {
    const c = await ApiClient.create();
    await c.loginAs('admin');
    await use(c);
    await c.dispose();
  },

  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginPageAs(page, 'admin');
    await use(page);
    await ctx.close();
  },

  teacherPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginPageAs(page, 'teacher');
    await use(page);
    await ctx.close();
  },

  assistantPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginPageAs(page, 'assistant');
    await use(page);
    await ctx.close();
  },

  studentPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginPageAs(page, 'student1');
    await use(page);
    await ctx.close();
  },

  uniqueSlug: async ({}, use) => {
    await use(uniqueSlug());
  },
});

export { expect } from '@playwright/test';
