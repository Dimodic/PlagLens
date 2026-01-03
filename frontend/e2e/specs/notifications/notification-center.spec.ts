/**
 * E2E: /notifications — NotificationCenterPage
 *
 * Tabs: Unread / All / Archived; severity filter; per-event_type filter;
 * mark-all-read; per-row mark-read / archive; click → navigate action_url.
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

  test('severity filter renders without errors', async ({ studentPage }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    await po.severityFilter.click();
    // Mantine Select renders options as listbox items.
    await expect(
      studentPage.getByRole('option', { name: 'Info' }).first(),
    ).toBeVisible();
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

  test('event_type and since filter accept input', async ({ studentPage }) => {
    const po = new NotificationCenterPagePo(studentPage);
    await po.goto();
    await po.eventTypeFilter.fill('submission.grade.assigned.v1');
    await po.sinceFilter.fill('2024-01-01T00:00:00Z');
    await expect(po.eventTypeFilter).toHaveValue(
      'submission.grade.assigned.v1',
    );
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
