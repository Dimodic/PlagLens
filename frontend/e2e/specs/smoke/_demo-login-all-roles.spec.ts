/**
 * Smoke: every visible demo card on /demo logs the user in successfully.
 *
 * For each role we click the "Войти" button on its card, expect a redirect
 * away from /demo, and verify the header shows the right account email.
 *
 * The /demo page surfaces 3 one-click cards (admin, teacher, student1);
 * the remaining seed accounts (assistant, student2..4) are still in the DB
 * but reachable only via /login with explicit credentials, so they are not
 * exercised here.
 *
 * Test runs are serialized within this file to avoid the gateway's per-IP
 * rate limit on /auth/login (60 rps).
 */
import { test, expect } from '@playwright/test';
import type { DemoRole } from '../../helpers/api';
import { DEMO_USERS } from '../../helpers/api';

const ROLES: DemoRole[] = ['admin', 'teacher', 'student1'];

test.describe.configure({ mode: 'serial' });

test.describe('@smoke demo-login', () => {
  for (const role of ROLES) {
    test(`demo card "${role}" logs in and lands on shell`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      try {
        await page.goto('/demo');
        await expect(page.getByTestId(`demo-card-${role}`)).toBeVisible();

        // Watch the login response so we can fail fast on rate-limit (429).
        const respPromise = page.waitForResponse(
          (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
          { timeout: 15_000 },
        );
        await page.getByTestId(`demo-login-${role}`).click();
        const resp = await respPromise;
        if (resp.status() === 429) {
          test.skip(true, 'Gateway rate-limited demo login — re-run with fewer parallel workers');
        }
        expect(resp.ok(), `Login as ${role} returned ${resp.status()}`).toBeTruthy();

        // Demo page navigates to "/", then HomeRedirect routes by role.
        await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 15_000 });
        await expect(page).not.toHaveURL(/\/login/);

        // The Header should show the user menu after login (proves authedness).
        await expect(page.getByTestId('header-user-menu-trigger')).toBeVisible({ timeout: 10_000 });

        // Open user menu and verify the email matches.
        await page.getByTestId('header-user-menu-trigger').click();
        const expectedEmail = DEMO_USERS[role].email;
        await expect(page.getByTestId('header-user-email')).toHaveText(expectedEmail);
      } finally {
        await ctx.close();
      }
    });
  }
});
