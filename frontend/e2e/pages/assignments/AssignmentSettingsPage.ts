/**
 * Page Object: /assignments/:id/settings — general + grading tabs.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { inputByTestId } from '../../helpers/inputs';

export class AssignmentSettingsPage {
  readonly page: Page;
  readonly assignmentId: string;

  constructor(page: Page, assignmentId: string) {
    this.page = page;
    this.assignmentId = assignmentId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/assignments/${this.assignmentId}/settings`);
    await expect(this.page.getByTestId('assignment-settings-tab-general')).toBeVisible();
  }

  generalTab(): Locator {
    return this.page.getByTestId('assignment-settings-tab-general');
  }
  gradingTab(): Locator {
    return this.page.getByTestId('assignment-settings-tab-grading');
  }
  titleInput(): Locator {
    return inputByTestId(this.page, 'assignment-settings-title');
  }
  maxScoreInput(): Locator {
    return inputByTestId(this.page, 'assignment-settings-max_score');
  }
  weightInput(): Locator {
    return inputByTestId(this.page, 'assignment-settings-weight');
  }
  generalSubmitButton(): Locator {
    return this.page.getByTestId('assignment-settings-submit');
  }
  rubricInput(): Locator {
    return inputByTestId(this.page, 'assignment-grading-rubric');
  }
  passThresholdInput(): Locator {
    return inputByTestId(this.page, 'assignment-grading-pass_threshold');
  }
  gradingSubmitButton(): Locator {
    return this.page.getByTestId('assignment-grading-submit');
  }

  async setTitle(title: string): Promise<void> {
    await this.titleInput().fill(title);
  }

  async saveGeneral(): Promise<void> {
    await this.generalSubmitButton().click();
  }

  async openGradingTab(): Promise<void> {
    await this.gradingTab().click();
    await expect(this.rubricInput()).toBeVisible();
  }

  async setRubric(rubricJson: string): Promise<void> {
    await this.rubricInput().fill(rubricJson);
  }

  async setPassThreshold(value: number): Promise<void> {
    await this.passThresholdInput().fill(String(value));
  }

  async saveGrading(): Promise<void> {
    await this.gradingSubmitButton().click();
  }
}
