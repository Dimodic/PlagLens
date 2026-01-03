/**
 * Reusable wait/poll helpers — keep tests readable & deterministic.
 *
 * Prefer Playwright's built-in waitFor / expect.poll over raw setTimeout.
 */
import { expect, type Page } from '@playwright/test';

/**
 * Wait for a Mantine notification (toast) by partial text content.
 * Mantine renders toasts inside [data-portal="true"] containers.
 */
export async function waitForToast(
  page: Page,
  text: string | RegExp,
  timeout = 5_000,
): Promise<void> {
  const re = typeof text === 'string' ? new RegExp(text, 'i') : text;
  await expect(page.locator('.mantine-Notification-root, [role="alert"]').filter({ hasText: re }).first()).toBeVisible({
    timeout,
  });
}

/**
 * Poll an HTTP endpoint until predicate returns true. Used for async ops.
 */
export async function waitForOperation<T>(
  fetcher: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const timeout = opts.timeout ?? 30_000;
  const interval = opts.interval ?? 1_000;
  const deadline = Date.now() + timeout;
  let last: T | null = null;
  while (Date.now() < deadline) {
    last = await fetcher();
    if (predicate(last)) return last;
    await new Promise((res) => setTimeout(res, interval));
  }
  throw new Error(`waitForOperation timed out after ${timeout}ms; last value: ${JSON.stringify(last)}`);
}

/**
 * Wait for an SSE stream by listening to network responses on the URL.
 */
export async function waitForSSE(page: Page, urlPattern: RegExp, timeout = 10_000): Promise<void> {
  await page.waitForResponse(
    (r) => urlPattern.test(r.url()) && (r.headers()['content-type'] ?? '').includes('text/event-stream'),
    { timeout },
  );
}

/**
 * Wait until the user appears authenticated (the Header user menu is visible).
 */
export async function waitForAuthenticated(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.getByTestId('header-user-menu-trigger')).toBeVisible({ timeout });
}
