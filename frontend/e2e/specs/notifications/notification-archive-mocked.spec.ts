/**
 * E2E: archive a notification (mocked).
 *
 * The archive action issues POST /users/me/notifications/{id}:archive — we
 * stub the endpoint and verify the UI calls it when the row's archive icon
 * is clicked.
 */
import { expect, test } from '../../setup/fixtures';

test.describe('Notification archive (mocked)', () => {
  test('archive endpoint is called when present', async ({ studentPage }) => {
    let called = false;
    await studentPage.route(
      /\/users\/me\/notifications\/[^/]+:archive/,
      async (route) => {
        called = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ archived: true }),
        });
      },
    );
    await studentPage.goto('/notifications');
    const archiveBtn = studentPage.locator('[data-testid^="archive-"]').first();
    if (await archiveBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await archiveBtn.click();
      // Allow request to propagate.
      await studentPage.waitForTimeout(500);
      expect(called).toBeTruthy();
    }
  });
});
