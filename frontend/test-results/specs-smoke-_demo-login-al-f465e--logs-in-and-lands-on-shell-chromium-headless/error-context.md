# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\smoke\_demo-login-all-roles.spec.ts >> @smoke demo-login >> demo card "teacher" logs in and lands on shell
- Location: e2e\specs\smoke\_demo-login-all-roles.spec.ts:20:5

# Error details

```
Error: Login as teacher returned 401

expect(received).toBeTruthy()

Received: false
```

# Test source

```ts
  1  | /**
  2  |  * Smoke: every demo card on /demo logs the user in successfully.
  3  |  *
  4  |  * For each role we click the "Войти" button on its card, expect a redirect
  5  |  * away from /demo, and verify the header shows the right account email.
  6  |  *
  7  |  * Test runs are serialized within this file to avoid the gateway's per-IP
  8  |  * rate limit on /auth/login (60 rps).
  9  |  */
  10 | import { test, expect } from '@playwright/test';
  11 | import type { DemoRole } from '../../helpers/api';
  12 | import { DEMO_USERS } from '../../helpers/api';
  13 | 
  14 | const ROLES: DemoRole[] = ['admin', 'teacher', 'assistant', 'student1', 'student2', 'student3', 'student4'];
  15 | 
  16 | test.describe.configure({ mode: 'serial' });
  17 | 
  18 | test.describe('@smoke demo-login', () => {
  19 |   for (const role of ROLES) {
  20 |     test(`demo card "${role}" logs in and lands on shell`, async ({ browser }) => {
  21 |       const ctx = await browser.newContext();
  22 |       const page = await ctx.newPage();
  23 |       try {
  24 |         await page.goto('/demo');
  25 |         await expect(page.getByTestId(`demo-card-${role}`)).toBeVisible();
  26 | 
  27 |         // Watch the login response so we can fail fast on rate-limit (429).
  28 |         const respPromise = page.waitForResponse(
  29 |           (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
  30 |           { timeout: 15_000 },
  31 |         );
  32 |         await page.getByTestId(`demo-login-${role}`).click();
  33 |         const resp = await respPromise;
  34 |         if (resp.status() === 429) {
  35 |           test.skip(true, 'Gateway rate-limited demo login — re-run with fewer parallel workers');
  36 |         }
> 37 |         expect(resp.ok(), `Login as ${role} returned ${resp.status()}`).toBeTruthy();
     |                                                                         ^ Error: Login as teacher returned 401
  38 | 
  39 |         // Demo page navigates to "/", then HomeRedirect routes by role.
  40 |         await page.waitForURL((url) => !url.pathname.startsWith('/demo'), { timeout: 15_000 });
  41 |         await expect(page).not.toHaveURL(/\/login/);
  42 | 
  43 |         // The Header should show the user menu after login (proves authedness).
  44 |         await expect(page.getByTestId('header-user-menu-trigger')).toBeVisible({ timeout: 10_000 });
  45 | 
  46 |         // Open user menu and verify the email matches.
  47 |         await page.getByTestId('header-user-menu-trigger').click();
  48 |         const expectedEmail = DEMO_USERS[role].email;
  49 |         await expect(page.getByTestId('header-user-email')).toHaveText(expectedEmail);
  50 |       } finally {
  51 |         await ctx.close();
  52 |       }
  53 |     });
  54 |   }
  55 | });
  56 | 
```