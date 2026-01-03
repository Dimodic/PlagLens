/**
 * Page Object: /courses/:slug/dashboard
 */
import type { Locator, Page } from '@playwright/test';

export type CourseDashboardTab =
  | 'overview'
  | 'grades'
  | 'plagiarism'
  | 'ai'
  | 'timeline'
  | 'languages'
  | 'activity'
  | 'late';

export class CourseDashboardPagePo {
  readonly page: Page;
  readonly tabsList: Locator;
  readonly gradesHistogram: Locator;
  readonly submissionsTimeline: Locator;
  readonly languagePie: Locator;
  readonly aiUsageDonut: Locator;
  readonly activityFeed: Locator;
  readonly lateList: Locator;

  constructor(page: Page) {
    this.page = page;
    this.tabsList = page.locator('[role="tablist"]').first();
    this.gradesHistogram = page.getByTestId('grade-histogram');
    this.submissionsTimeline = page.getByTestId('submissions-timeline').first();
    this.languagePie = page.getByTestId('language-pie');
    this.aiUsageDonut = page.getByTestId('ai-usage-donut');
    this.activityFeed = page.getByTestId('activity-feed');
    this.lateList = page.getByTestId('late-submissions-list');
  }

  async goto(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/dashboard`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async selectTab(tab: CourseDashboardTab): Promise<void> {
    const labels: Record<CourseDashboardTab, string | RegExp> = {
      overview: /Обзор/,
      grades: /Оценки/,
      plagiarism: /Плагиат/,
      ai: /^AI$/,
      timeline: /Таймлайн/,
      languages: /Языки/,
      activity: /Активность/,
      late: /Опоздания/,
    };
    await this.page.getByRole('tab', { name: labels[tab] }).click();
  }

  kpi(name: string): Locator {
    return this.page.getByTestId(`kpi-${name}`);
  }
}
