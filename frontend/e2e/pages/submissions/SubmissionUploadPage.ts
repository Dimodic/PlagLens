/**
 * Page Object: /assignments/:id/upload — student upload via Mantine Dropzone.
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class SubmissionUploadPage {
  readonly page: Page;
  readonly assignmentId: string;

  constructor(page: Page, assignmentId: string) {
    this.page = page;
    this.assignmentId = assignmentId;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/assignments/${this.assignmentId}/upload`);
    await expect(this.page.getByTestId('submission-dropzone')).toBeVisible();
  }

  dropzone(): Locator {
    return this.page.getByTestId('submission-dropzone');
  }

  /**
   * Internal hidden file input inside Mantine Dropzone — used for setInputFiles.
   * The Mantine Dropzone always renders an <input type="file" /> child.
   */
  fileInput(): Locator {
    return this.dropzone().locator('input[type="file"]');
  }

  uploadButton(): Locator {
    return this.page.getByTestId('submission-upload-submit');
  }

  cancelButton(): Locator {
    return this.page.getByTestId('submission-upload-cancel');
  }

  progressBar(): Locator {
    return this.page.getByTestId('submission-upload-progress');
  }

  async setFiles(paths: string[]): Promise<void> {
    await this.fileInput().setInputFiles(paths);
  }

  async clickUpload(): Promise<void> {
    await this.uploadButton().click();
  }

  async uploadFiles(paths: string[]): Promise<void> {
    await this.setFiles(paths);
    await this.clickUpload();
  }

  /** Drag and drop a file via DataTransfer-based event simulation. */
  async dragDropFile(filePath: string, fileName: string, mimeType: string = 'text/plain'): Promise<void> {
    const fs = await import('node:fs/promises');
    const buf = await fs.readFile(filePath);
    const base64 = buf.toString('base64');
    await this.page.evaluate(
      async ({ name, mime, data, testId }) => {
        const dropTarget = document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
        if (!dropTarget) throw new Error(`drop target ${testId} not found`);
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const file = new File([bytes], name, { type: mime });
        const dt = new DataTransfer();
        dt.items.add(file);
        const dropEvt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt });
        Object.defineProperty(dropEvt, 'dataTransfer', { value: dt });
        dropTarget.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropTarget.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        dropTarget.dispatchEvent(dropEvt);
      },
      { name: fileName, mime: mimeType, data: base64, testId: 'submission-dropzone' },
    );
  }
}
