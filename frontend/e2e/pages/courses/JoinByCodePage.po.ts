/**
 * Page Object: /courses/join and /courses/join/:code
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';
import { fillInput } from '../../helpers/inputs';

export class JoinByCodePagePo {
  readonly page: Page;
  readonly codeInput: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.codeInput = page.locator(
      `[data-testid="${TEST_IDS.joinCodeInput}"] input`,
    );
    this.submit = page.getByTestId(TEST_IDS.joinSubmit);
  }

  async goto(code?: string): Promise<void> {
    const path = code ? `/courses/join/${encodeURIComponent(code)}` : '/courses/join';
    await this.page.goto(path);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.codeInput).toBeVisible({ timeout: 10_000 });
  }

  async fillCode(code: string): Promise<void> {
    await fillInput(this.page, TEST_IDS.joinCodeInput, code);
  }

  async submitForm(): Promise<void> {
    await this.submit.click();
  }
}
