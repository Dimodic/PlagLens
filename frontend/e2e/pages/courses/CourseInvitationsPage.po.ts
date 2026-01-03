/**
 * Page Object: /courses/:slug/invitations
 */
import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_IDS } from '../../helpers/selectors';

export class CourseInvitationsPagePo {
  readonly page: Page;
  readonly title: Locator;
  readonly createButton: Locator;
  readonly roleSelect: Locator;
  readonly emailInput: Locator;
  readonly maxUsesInput: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.title = page.getByTestId(TEST_IDS.courseInvitationsTitle);
    this.createButton = page.getByTestId(TEST_IDS.courseInvitationsCreateButton);
    this.roleSelect = page.locator(
      `[data-testid="${TEST_IDS.courseInvitationsRoleSelect}"] input`,
    );
    this.emailInput = page.locator(
      `[data-testid="${TEST_IDS.courseInvitationsEmail}"] input`,
    );
    this.maxUsesInput = page.locator(
      `[data-testid="${TEST_IDS.courseInvitationsMaxUses}"] input`,
    );
    this.submit = page.getByTestId(TEST_IDS.courseInvitationsSubmit);
  }

  async gotoBySlug(slug: string): Promise<void> {
    await this.page.goto(`/courses/${slug}/invitations`);
    await this.page.waitForLoadState('domcontentloaded');
    await expect(this.title).toBeVisible({ timeout: 15_000 });
  }

  rowForId(id: string | number): Locator {
    return this.page.getByTestId(`invitation-${id}`);
  }

  codeForId(id: string | number): Locator {
    return this.page.getByTestId(`invitation-code-${id}`);
  }

  copyButtonForId(id: string | number): Locator {
    return this.page.getByTestId(`invitation-copy-${id}`);
  }

  deleteButtonForId(id: string | number): Locator {
    return this.page.getByTestId(`invitation-delete-${id}`);
  }

  async openCreateDialog(): Promise<void> {
    await this.createButton.click();
    await expect(this.maxUsesInput).toBeVisible({ timeout: 5_000 });
  }

  async createInvitation(opts: {
    role?: 'student' | 'assistant';
    email?: string;
    maxUses?: number | null;
  } = {}): Promise<void> {
    await this.openCreateDialog();
    if (opts.email) {
      await this.emailInput.fill(opts.email);
    }
    if (opts.maxUses !== undefined && opts.maxUses !== null) {
      await this.maxUsesInput.fill(String(opts.maxUses));
    }
    await this.submit.click();
  }
}
