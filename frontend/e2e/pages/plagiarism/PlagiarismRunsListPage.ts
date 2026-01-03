/**
 * Page Object: /assignments/:assignmentId/plagiarism — list of plagiarism runs
 * + "Запустить новую проверку" modal.
 *
 * The POM keeps locators stable so spec files focus on behaviour, not layout.
 * Each method returns the locator (or void) and never asserts — assertions
 * stay in the spec for clearer test failures.
 */
import type { Locator, Page } from '@playwright/test';

export class PlagiarismRunsListPage {
  constructor(public readonly page: Page) {}

  async open(assignmentId: string): Promise<void> {
    await this.page.goto(`/assignments/${assignmentId}/plagiarism`);
  }

  get title(): Locator {
    return this.page.getByRole('heading', { name: 'Проверки на плагиат' });
  }

  get runsTable(): Locator {
    return this.page.getByTestId('plagiarism-runs-table');
  }

  runRow(runId: string): Locator {
    return this.page.getByTestId(`plagiarism-run-row-${runId}`);
  }

  get openCreateModalButton(): Locator {
    return this.page.getByTestId('plagiarism-run-create-open');
  }

  get createModal(): Locator {
    // Mantine v7 places the visible content under .mantine-Modal-content;
    // the data-testid lives on a wrapper that is rendered hidden by default.
    return this.page
      .getByTestId('plagiarism-run-create-modal')
      .locator('.mantine-Modal-content');
  }

  get providerSelect(): Locator {
    return this.page.getByTestId('plagiarism-run-create-provider');
  }

  get withCorpusCheckbox(): Locator {
    return this.page.getByTestId('plagiarism-run-create-with-corpus');
  }

  get submitCreateButton(): Locator {
    return this.page.getByTestId('plagiarism-run-create-submit');
  }

  get cancelCreateButton(): Locator {
    return this.page.getByTestId('plagiarism-run-create-cancel');
  }

  async openCreateModal(): Promise<void> {
    await this.openCreateModalButton.click();
  }

  async pickProvider(value: 'jplag' | 'moss' | 'dolos' | 'codequiry'): Promise<void> {
    // Mantine Select renders an input; clicking opens an option list.
    await this.providerSelect.click();
    const labelByValue: Record<string, string | RegExp> = {
      jplag: /JPlag/i,
      moss: /MOSS/i,
      dolos: /Dolos/i,
      codequiry: /Codequiry/i,
    };
    await this.page
      .getByRole('option', { name: labelByValue[value] })
      .first()
      .click();
  }

  async toggleWithCorpus(checked: boolean): Promise<void> {
    const cb = this.withCorpusCheckbox;
    const isChecked = await cb.isChecked();
    if (isChecked !== checked) await cb.click();
  }

  async submitCreate(): Promise<void> {
    await this.submitCreateButton.click();
  }
}
