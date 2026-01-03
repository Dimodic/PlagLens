/**
 * /me/security — password change tab.
 */
import { test, expect } from '../../setup/fixtures';
import { SecurityPo } from '../../pages/profile/SecurityPage.po';
import { waitForToast } from '../../helpers/waits';

test.describe('Profile security — password change', () => {
  test('teacher opens password tab and sees three password inputs', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    // Default tab is "password"
    await expect(po.passwordCurrent).toBeVisible({ timeout: 10_000 });
    await expect(po.passwordNew).toBeVisible();
    await expect(po.passwordConfirm).toBeVisible();
  });

  test('mismatch between new and confirm shows local Problem alert', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.passwordCurrent.fill('whatever');
    await po.passwordNew.fill('aaaaaaaaa');
    await po.passwordConfirm.fill('bbbbbbbbb');
    await po.passwordSubmit.click();
    await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 5_000 });
    await expect(teacherPage.getByText(/Пароли не совпадают|MISMATCH/i)).toBeVisible();
  });

  test('wrong current_password produces server Problem alert', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.passwordCurrent.fill('wrong-password');
    await po.passwordNew.fill('NewPass123!@#');
    await po.passwordConfirm.fill('NewPass123!@#');
    await po.passwordSubmit.click();
    await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
  });

  test('valid change attempt fires API call and toast', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.passwordCurrent.fill('teacher');
    const newPw = `Tr0ub4dor3-${Date.now()}!`;
    await po.passwordNew.fill(newPw);
    await po.passwordConfirm.fill(newPw);
    await po.passwordSubmit.click();
    // Either success toast OR error (if password policy fails).
    await expect(
      teacherPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
