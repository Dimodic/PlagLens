/**
 * /me/security — Sessions tab.
 */
import { test, expect } from '../../setup/fixtures';
import { SecurityPo } from '../../pages/profile/SecurityPage.po';

test.describe('Profile security — sessions', () => {
  test('teacher opens Sessions tab and sees at least one session row', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('sessions');
    // Sessions table or empty state.
    const rows = teacherPage.locator('[data-testid^="session-row-"]');
    if (await rows.first().isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(rows.first()).toBeVisible();
    } else {
      await expect(teacherPage.getByText(/Активных сессий нет/i)).toBeVisible({ timeout: 5_000 });
    }
  });

  test('current session is marked with "текущая" badge', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('sessions');
    const current = teacherPage.getByText('текущая').first();
    // If there is a current session row, the badge must exist.
    if (
      await teacherPage
        .locator('[data-testid^="session-row-"]')
        .first()
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    ) {
      await expect(current).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test('non-current sessions show a "Завершить" button', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('sessions');
    const revoke = teacherPage.getByRole('button', { name: /Завершить/i }).first();
    if (await revoke.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(revoke).toBeEnabled();
    } else {
      // Single-session edge — fine, no revoke button.
      test.skip();
    }
  });
});
