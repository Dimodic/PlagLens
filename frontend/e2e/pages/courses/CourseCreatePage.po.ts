/**
 * Page Object: /courses/new — form for creating a new course.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';
import { fillInput, inputByTestId } from '../../helpers/inputs';

export interface CreateCourseFormValues {
  name: string;
  slug?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
}

export class CourseCreatePagePo {
  readonly page: Page;
  readonly form: Locator;
  readonly name: Locator;
  readonly slug: Locator;
  readonly submit: Locator;
  readonly cancel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.getByTestId(TEST_IDS.courseCreateForm);
    this.name = inputByTestId(page, TEST_IDS.courseCreateName);
    this.slug = inputByTestId(page, TEST_IDS.courseCreateSlug);
    this.submit = page.getByTestId(TEST_IDS.courseCreateSubmit);
    this.cancel = page.getByTestId(TEST_IDS.courseCreateCancel);
  }

  async goto(): Promise<void> {
    await this.page.goto('/courses/new');
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.form).toBeVisible({ timeout: 10_000 });
  }

  async fill(values: CreateCourseFormValues): Promise<void> {
    await fillInput(this.page, TEST_IDS.courseCreateName, values.name);
    if (values.slug !== undefined) {
      // Clear first because the slug auto-generates.
      await this.slug.fill('');
      await this.slug.fill(values.slug);
    }
  }

  async submitAndExpectRedirect(): Promise<string> {
    await this.submit.click();
    await this.page.waitForURL(
      (url) => /\/courses\/[^/]+(?:\/.*)?$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 15_000 },
    );
    const m = this.page.url().match(/\/courses\/([^/?#]+)/);
    return m ? m[1] : '';
  }

  async submitAndExpectError(): Promise<void> {
    await this.submit.click();
    await expect(
      this.page.getByRole('alert').or(this.page.locator('text=/обязательно|coniflict|already exists|409/i')).first(),
    ).toBeVisible({ timeout: 10_000 });
  }
}
