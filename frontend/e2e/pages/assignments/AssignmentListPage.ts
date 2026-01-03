/**
 * Page Object: course detail page rendering the assignments list
 * (route /courses/:slug). Assignments are rendered via AssignmentCard
 * (data-testid="assignment-card").
 */
import { expect, type Locator, type Page } from '@playwright/test';

export class AssignmentListPage {
  readonly page: Page;
  readonly courseSlug: string;

  constructor(page: Page, courseSlug: string) {
    this.page = page;
    this.courseSlug = courseSlug;
  }

  async goto(): Promise<void> {
    await this.page.goto(`/courses/${this.courseSlug}`);
    await this.page.waitForLoadState('networkidle');
  }

  cards(): Locator {
    return this.page.getByTestId('assignment-card');
  }

  cardByTitle(title: string): Locator {
    return this.cards().filter({ hasText: title });
  }

  async openAssignmentByTitle(title: string): Promise<void> {
    await this.cardByTitle(title).first().click();
    await this.page.waitForURL(/\/assignments\/[^/]+$/);
  }

  createButton(): Locator {
    return this.page.getByTestId('course-detail-create-assignment');
  }

  async clickCreateAssignment(): Promise<void> {
    await this.createButton().click();
    await this.page.waitForURL(/\/assignments\/new$/);
  }

  async expectAtLeastOneCard(): Promise<void> {
    await expect(this.cards().first()).toBeVisible();
  }

  async expectCardCountAtLeast(n: number): Promise<void> {
    await expect.poll(async () => this.cards().count(), { timeout: 5000 }).toBeGreaterThanOrEqual(n);
  }

  async cardCount(): Promise<number> {
    return this.cards().count();
  }
}
