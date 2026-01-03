/**
 * Helpers to locate form inputs by data-testid.
 *
 * Mantine v7 forwards `data-testid` directly to the rendered <input>
 * (not the wrapper). We prefer matching the input itself, but for legacy
 * components that placed the testid on a wrapper we fall back to descending.
 */
import type { Locator, Page } from '@playwright/test';

export function inputByTestId(page: Page, testId: string): Locator {
  // Prefer the input/textarea/select with the testid directly. If none,
  // fall back to the wrapper-with-testid + inner input.
  const direct = page.locator(`input[data-testid="${testId}"], textarea[data-testid="${testId}"], select[data-testid="${testId}"]`);
  const nested = page.locator(`[data-testid="${testId}"]`).locator('input, textarea, select').first();
  // Playwright .or() returns the first matching locator. If `direct` matches,
  // it wins; otherwise we use `nested`.
  return direct.or(nested).first();
}

export async function fillInput(page: Page, testId: string, value: string): Promise<void> {
  const input = inputByTestId(page, testId);
  if ((await input.count()) > 0) {
    await input.fill(value);
    return;
  }
  // Fallback: assume the test id is on the input itself.
  await page.getByTestId(testId).fill(value);
}

export async function pressEnter(page: Page, testId: string): Promise<void> {
  const input = inputByTestId(page, testId);
  if ((await input.count()) > 0) {
    await input.press('Enter');
  } else {
    await page.getByTestId(testId).press('Enter');
  }
}
