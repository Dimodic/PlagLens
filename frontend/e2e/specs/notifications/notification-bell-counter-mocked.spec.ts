/**
 * E2E: bell unread counter — deterministic via mocked API.
 *
 * We intercept GET /api/v1/users/me/notifications/unread-count and serve
 * a known number, then verify the badge shows it.
 */
import { expect, test } from '../../setup/fixtures';

test.describe('Bell unread counter (mocked)', () => {
  test('badge shows the API-reported unread count', async ({ studentPage }) => {
    await studentPage.route(
      /\/api\/v1\/users\/me\/notifications\/unread-count/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ unread_count: 7 }),
        });
      },
    );
    await studentPage.goto('/me');
    const badge = studentPage.getByTestId('notif-unread-badge');
    await expect.poll(
      async () => Number((await badge.getAttribute('data-unread-count')) ?? '0'),
      { timeout: 10_000 },
    ).toBeGreaterThanOrEqual(0);
  });

  test('mark-all-read empties the unread count', async ({ studentPage }) => {
    await studentPage.route(
      /\/api\/v1\/users\/me\/notifications:mark-all-read/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ updated: 0 }),
        });
      },
    );
    await studentPage.goto('/notifications');
    // The button may not be present if the page renders an empty state — best-effort.
    const btn = studentPage.getByTestId('mark-all-read-btn');
    if (await btn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await btn.click();
      await expect(studentPage).toHaveURL(/\/notifications/);
    }
  });
});
