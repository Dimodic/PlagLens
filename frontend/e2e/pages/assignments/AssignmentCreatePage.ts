/**
 * Page Object: /courses/:slug/assignments/new — full assignment creation form.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export interface AssignmentFormInput {
  title: string;
  slug: string;
  description?: string;
  language?: string;
  maxScore?: number;
  weight?: number;
  lateMultiplier?: number;
  selectionStrategy?: 'last' | 'best' | 'manual';
  plagiarismAutoRun?: boolean;
  plagiarismThreshold?: number;
  aiAutoRun?: boolean;
}

export class AssignmentCreatePage {
  readonly page: Page;
  readonly courseSlug: string;

  constructor(page: Page, courseSlug: string) {
    this.page = page;
    this.courseSlug = courseSlug;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/courses/${this.courseSlug}/assignments/new`);
    await expect(this.page.getByTestId('assignment-form')).toBeVisible();
  }

  titleInput(): Locator {
    return this.page.getByTestId('assignment-form-title');
  }
  slugInput(): Locator {
    return this.page.getByTestId('assignment-form-slug');
  }
  descriptionInput(): Locator {
    // MarkdownEditor — has a Textarea inside the wrapper.
    return this.page.getByTestId('assignment-form-description').locator('textarea');
  }
  languageSelect(): Locator {
    return this.page.getByTestId('assignment-form-language');
  }
  maxScoreInput(): Locator {
    return this.page.getByTestId('assignment-form-max_score');
  }
  weightInput(): Locator {
    return this.page.getByTestId('assignment-form-weight');
  }
  lateMultiplierInput(): Locator {
    return this.page.getByTestId('assignment-form-late_multiplier');
  }
  plagiarismAutoRunSwitch(): Locator {
    return this.page.getByTestId('assignment-form-plagiarism_auto_run');
  }
  plagiarismThresholdInput(): Locator {
    return this.page.getByTestId('assignment-form-plagiarism_threshold');
  }
  aiAutoRunSwitch(): Locator {
    return this.page.getByTestId('assignment-form-ai_auto_run');
  }
  submitButton(): Locator {
    return this.page.getByTestId('assignment-form-submit');
  }
  cancelButton(): Locator {
    return this.page.getByTestId('assignment-form-cancel');
  }

  async fillForm(input: AssignmentFormInput): Promise<void> {
    await this.titleInput().fill(input.title);
    await this.slugInput().fill(input.slug);
    if (input.description) {
      await this.descriptionInput().fill(input.description);
    }
    if (input.maxScore !== undefined) {
      await this.maxScoreInput().fill(String(input.maxScore));
    }
    if (input.weight !== undefined) {
      await this.weightInput().fill(String(input.weight));
    }
    if (input.lateMultiplier !== undefined) {
      await this.lateMultiplierInput().fill(String(input.lateMultiplier));
    }
    if (input.selectionStrategy) {
      await this.page
        .getByTestId(`assignment-form-selection_strategy-${input.selectionStrategy}`)
        .click();
    }
    if (input.plagiarismThreshold !== undefined) {
      await this.plagiarismThresholdInput().fill(String(input.plagiarismThreshold));
    }
  }

  async submit(): Promise<void> {
    await this.submitButton().click();
  }

  async createAssignment(input: AssignmentFormInput): Promise<void> {
    await this.fillForm(input);
    await this.submit();
  }

  async expectValidationError(text: string | RegExp): Promise<void> {
    const re = typeof text === 'string' ? new RegExp(text, 'i') : text;
    await expect(this.page.locator('body')).toContainText(re);
  }
}
