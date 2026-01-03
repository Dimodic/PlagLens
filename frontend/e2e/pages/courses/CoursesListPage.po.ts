/**
 * Page Object: /courses — list of courses for the current user.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';
import { fillInput } from '../../helpers/inputs';

export class CoursesListPagePo {
  readonly page: Page;
  readonly title: Locator;
  readonly createButton: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly emptyState: Locator;
  readonly joinByCodeButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId(TEST_IDS.coursesListTitle);
    this.createButton = page.getByTestId(TEST_IDS.coursesListCreateButton);
    this.searchInput = page.locator(
      `[data-testid="${TEST_IDS.coursesListSearchInput}"] input`,
    );
    this.statusFilter = page.getByTestId(TEST_IDS.coursesListStatusFilter);
    this.emptyState = page.getByTestId(TEST_IDS.coursesListEmpty);
    this.joinByCodeButton = page.getByTestId(TEST_IDS.coursesListJoinByCodeButton);
  }

  async goto(): Promise<void> {
    await this.page.goto('/courses');
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for either the list title or the empty state to be visible.
    await expect(this.title).toBeVisible({ timeout: 15_000 });
  }

  rowForSlug(slug: string): Locator {
    return this.page.getByTestId(TEST_IDS.coursesListRow(slug));
  }

  /** All visible course cards in the current view. */
  cards(): Locator {
    return this.page.locator('[data-testid^="courses-list-row-"]');
  }

  async search(text: string): Promise<void> {
    await fillInput(this.page, TEST_IDS.coursesListSearchInput, text);
  }

  async clickCreate(): Promise<void> {
    await this.createButton.click();
    await this.page.waitForURL(/\/courses\/new$/, { timeout: 10_000 });
  }

  async clickRow(slug: string): Promise<void> {
    await this.rowForSlug(slug).click();
    await this.page.waitForURL(new RegExp(`/courses/${slug}(?:[?#].*)?$`), {
      timeout: 15_000,
    });
  }

  /** Filter by status using SegmentedControl. */
  async setStatus(value: 'all' | 'active' | 'draft' | 'archived'): Promise<void> {
    const labels: Record<typeof value, string> = {
      all: 'Все',
      active: 'Активные',
      draft: 'Черновики',
      archived: 'В архиве',
    } as const;
    await this.statusFilter.getByText(labels[value], { exact: true }).click();
  }
}
