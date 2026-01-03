/**
 * Page Object: /submissions/:id — viewer with multiple tabs.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { inputByTestId } from '../../helpers/inputs';

export type SubmissionTab = 'files' | 'grade' | 'feedback' | 'plagiarism' | 'ai' | 'flags' | 'history';

export class SubmissionDetailPage {
  readonly page: Page;
  readonly submissionId: string;

  constructor(page: Page, submissionId: string) {
    this.page = page;
    this.submissionId = submissionId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/submissions/${this.submissionId}`);
    await expect(this.page.getByTestId('submission-detail')).toBeVisible({ timeout: 10000 });
  }

  tab(name: SubmissionTab): Locator {
    return this.page.getByTestId(`submission-tab-${name}`);
  }

  async openTab(name: SubmissionTab): Promise<void> {
    await this.tab(name).click();
  }

  async expectTabVisible(name: SubmissionTab): Promise<void> {
    await expect(this.tab(name)).toBeVisible();
  }

  async expectTabHidden(name: SubmissionTab): Promise<void> {
    await expect(this.tab(name)).toHaveCount(0);
  }

  fileTreeNode(path: string): Locator {
    return this.page.getByTestId(`submission-file-tree-node-${path}`);
  }

  codeViewer(): Locator {
    return this.page.getByTestId('submission-code-viewer');
  }

  versionLabel(): Locator {
    return this.page.getByTestId('submission-version');
  }

  lateBadge(): Locator {
    return this.page.getByTestId('submission-late-badge');
  }

  // -------------------- Grade --------------------
  gradeInput(): Locator {
    return inputByTestId(this.page, 'submission-grade-input');
  }
  gradeComment(): Locator {
    return inputByTestId(this.page, 'submission-grade-comment');
  }
  gradeVisibleCheckbox(): Locator {
    return inputByTestId(this.page, 'submission-grade-visible-to-student');
  }
  gradeSubmit(): Locator {
    return this.page.getByTestId('submission-grade-submit');
  }
  gradeDelete(): Locator {
    return this.page.getByTestId('submission-grade-delete');
  }
  gradeLateHardWarning(): Locator {
    return this.page.getByTestId('grade-form-late-hard-warning');
  }

  async setScore(score: number): Promise<void> {
    await this.gradeInput().fill(String(score));
  }

  async setGradeVisibleToStudent(visible: boolean): Promise<void> {
    const cb = this.gradeVisibleCheckbox();
    const isChecked = await cb.isChecked();
    if (isChecked !== visible) await cb.click();
  }

  async submitGrade(score: number, opts: { commentVisible?: boolean; comment?: string } = {}): Promise<void> {
    await this.openTab('grade');
    await this.setScore(score);
    if (opts.comment !== undefined) {
      await this.gradeComment().fill(opts.comment);
    }
    if (opts.commentVisible !== undefined) {
      await this.setGradeVisibleToStudent(opts.commentVisible);
    }
    await this.gradeSubmit().click();
  }

  // -------------------- Feedback --------------------
  feedbackBody(): Locator {
    return inputByTestId(this.page, 'feedback-form-body');
  }
  feedbackVisibleCheckbox(): Locator {
    return inputByTestId(this.page, 'feedback-form-visible');
  }
  feedbackSubmit(): Locator {
    return this.page.getByTestId('feedback-form-submit');
  }
  feedbackItems(): Locator {
    return this.page.locator('[data-testid^="feedback-"]:not([data-testid^="feedback-form"])');
  }

  async addFeedback(body: string, visible: boolean): Promise<void> {
    await this.openTab('feedback');
    await this.feedbackBody().fill(body);
    const cb = this.feedbackVisibleCheckbox();
    const isChecked = await cb.isChecked();
    if (isChecked !== visible) await cb.click();
    await this.feedbackSubmit().click();
  }

  // -------------------- Flags --------------------
  manualFlagButton(): Locator {
    return this.page.getByTestId('flags-add-manual');
  }

  async addManualFlag(): Promise<void> {
    await this.openTab('flags');
    await this.manualFlagButton().click();
  }
}
