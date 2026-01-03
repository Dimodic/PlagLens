/**
 * Page Object: /me — My Dashboard.
 */
import type { Locator, Page } from '@playwright/test';

export class MyDashboardPagePo {
  readonly page: Page;
  readonly kpisRoot: Locator;
  readonly kpiMyCourses: Locator;
  readonly kpiUpcomingDeadlines: Locator;
  readonly kpiRecentGrades: Locator;
  readonly kpiAverageScore: Locator;
  readonly myCoursesTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.kpisRoot = page.getByTestId('my-dashboard-kpis');
    this.kpiMyCourses = page.getByTestId('kpi-my-courses');
    this.kpiUpcomingDeadlines = page.getByTestId('kpi-upcoming-deadlines');
    this.kpiRecentGrades = page.getByTestId('kpi-recent-grades');
    this.kpiAverageScore = page.getByTestId('kpi-average-score');
    this.myCoursesTable = page.getByTestId('my-courses-table');
  }

  async goto(): Promise<void> {
    await this.page.goto('/me');
    await this.page.waitForLoadState('domcontentloaded');
  }
}
