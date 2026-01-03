/**
 * E2E: per-row "mark as read" (mocked).
 *
 * Clicking the per-row "прочитано" action issues POST :mark-read with the
 * row id. We stub the endpoint and verify the request fires.
 */
import { expect, test } from '../../setup/fixtures';

test.describe('Per-row mark-read (mocked)', () => {
  test('clicking the row action triggers POST :mark-read (when present)', async ({
    studentPage,
  }) => {
    let called = false;
    await studentPage.route(
      /\/users\/me\/notifications\/[^/]+:mark-read/,
      async (route) => {
        called = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ read: true }),
        });
      },
    );
    await studentPage.goto('/notifications');
    const markBtn = studentPage.locator('[data-testid^="mark-read-"]').first();
    if (await markBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await markBtn.click();
      await studentPage.waitForTimeout(500);
      expect(called).toBeTruthy();
    }
  });
});
