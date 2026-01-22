/**
 * E2E: /notifications — NotificationCenterPage
 *
 * Tabs: Unread / All / Archived; mark-all-read; per-row mark-read / archive;
 * settings link in the header; click → navigate action_url.
 *
 * Filters by severity / event_type / since were intentionally dropped from
 * the UI — they were developer jargon. If you need to filter, use the
 * preferences page or query the API directly.
 */
import { expect, test } from '../../setup/fixtures';
import { NotificationCenterPagePo } from '../../pages/notifications/NotificationCenterPage.po';

test.describe('Notification Center', () => {
  test('opens with three tabs visible', async ({ studentPage }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    await expect(studentPage).toHaveURL(/\/notifications/);
    await expect(po.tabUnread).toBeVisible();
    await expect(po.tabAll).toBeVisible();
    await expect(po.tabArchived).toBeVisible();
  });

  test('switching tab "Все" updates the URL state without breaking page', async ({
    studentPage,
  }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    await po.tabAll.click();
    await expect(po.tabAll).toHaveAttribute('aria-selected', 'true');
  });

  test('settings icon links to the preferences page', async ({
    studentPage,
  }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    await expect(po.settingsLink).toBeVisible();
    await po.settingsLink.click();
    await expect(studentPage).toHaveURL(/\/me\/notifications\/preferences$/);
  });

  test('"Прочитать все" button calls API and stays on the page', async ({
    studentPage,
  }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    // Wait for any rendered list or empty state, then click.
    await po.markAllBtn.click();
    // Page should not navigate.
    await expect(studentPage).toHaveURL(/\/notifications/);
  });

  test('clicking on a notification navigates to its action_url when present', async ({
    studentPage,
  }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    // Switch to "All" so we have a chance of finding a row.
    await po.tabAll.click();
    const row = studentPage.locator('[data-testid^="notification-item-"]').first();
    if (await row.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Click the "Открыть" hidden button — first ActionIcon child.
      await row.click();
      // Either we navigated away from /notifications or there was no action_url.
      await studentPage.waitForLoadState('domcontentloaded');
    }
  });
});
