/**
 * Custom expect-style assertions for PlagLens-specific UI patterns.
 *
 * These wrap common assertion sequences so test bodies stay focused on intent.
 */
import { expect, type Page, type Locator } from '@playwright/test';
import { TEST_IDS } from './selectors';

/**
 * Assert that a Problem alert (RFC 7807 -> ProblemAlert component) is
 * displayed and contains a given text fragment (title or detail).
 */
export async function expectProblemAlert(
  page: Page | Locator,
  textFragment: string | RegExp,
): Promise<void> {
  const re = typeof textFragment === 'string' ? new RegExp(textFragment, 'i') : textFragment;
  // Mantine Alert root has role="alert".
  const root = 'getByRole' in page ? page : page;
  await expect(root.getByRole('alert').filter({ hasText: re }).first()).toBeVisible();
}

/**
 * Assert the user is authenticated: header user menu visible, no /login route.
 */
export async function expectAuthenticated(page: Page): Promise<void> {
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByTestId(TEST_IDS.headerUserMenuTrigger)).toBeVisible();
}

/**
 * Assert the user is anonymous: page is /login (or /demo).
 */
export async function expectAnonymous(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/(login|demo|register|auth\/)/);
}

/**
 * Assert no console errors recorded during the test. Pass an array collected
 * via page.on('console') in a beforeEach.
 */
export function expectNoConsoleErrors(errors: string[]): void {
  // Filter known-noisy items (React dev-mode hot reload, etc.).
  const ignored = [
    /\[HMR\]/,
    /Download the React DevTools/,
    /favicon/i,
    /Mantine.*Provider/i,
  ];
  const significant = errors.filter((e) => !ignored.some((re) => re.test(e)));
  expect(significant, `Unexpected console errors:\n${significant.join('\n')}`).toEqual([]);
}
