/**
 * E2E: header bell dropdown.
 *
 * The NotificationsBellDropdown is mounted in the AppShell header and visible
 * after login. We verify: bell icon visible, dropdown opens, "Открыть все"
 * navigates to /notifications.
 */
import { expect, test } from '../../setup/fixtures';

test.describe('Notification bell dropdown', () => {
  test('bell icon is visible after login', async ({ studentPage }) => {
    await studentPage.goto('/me');
    await expect(studentPage.getByTestId('notif-bell')).toBeVisible();
    await expect(studentPage.getByTestId('bell-icon')).toBeVisible();
  });

  test('clicking the bell opens the dropdown', async ({ studentPage }) => {
    await studentPage.goto('/me');
    await studentPage.getByTestId('bell-icon').click();
    await expect(studentPage.getByTestId('bell-dropdown')).toBeVisible();
    // Header inside dropdown.
    await expect(
      studentPage.getByTestId('bell-dropdown').getByText('Уведомления'),
    ).toBeVisible();
  });

  test('"Открыть все" link navigates to /notifications', async ({
    studentPage,
  }) => {
    await studentPage.goto('/me');
    await studentPage.getByTestId('bell-icon').click();
    await studentPage.getByTestId('open-all-link').click();
    await expect(studentPage).toHaveURL(/\/notifications$/);
  });

  test('unread badge is present whenever there is an unread count', async ({
    studentPage,
  }) => {
    await studentPage.goto('/me');
    const badge = studentPage.getByTestId('notif-unread-badge');
    // Indicator always renders; data-unread-count attr should be a number.
    const attr = await badge.getAttribute('data-unread-count');
    expect(attr).toMatch(/^\d+$/);
  });
});
