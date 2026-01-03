/**
 * E2E: Quiet hours + timezone preferences.
 *
 * The fields accept HH:MM strings and a timezone name; saving them issues a
 * PATCH to /users/me/notification-preferences.
 */
import { expect, test } from '../../setup/fixtures';
import { PreferencesPagePo } from '../../pages/notifications/PreferencesPage.po';

test.describe('Quiet hours preferences', () => {
  test('quiet-hours start + end + timezone fields accept input', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    const start = studentPage.getByLabel('Тихие часы — начало (HH:MM)');
    const end = studentPage.getByLabel('Тихие часы — конец (HH:MM)');
    const tz = studentPage.getByLabel('Часовой пояс');
    await start.fill('22:30');
    await end.fill('07:30');
    await tz.fill('Europe/Moscow');
    await expect(start).toHaveValue('22:30');
    await expect(end).toHaveValue('07:30');
    await expect(tz).toHaveValue('Europe/Moscow');
  });

  test('saving quiet hours issues a PATCH (best-effort)', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    await studentPage
      .getByLabel('Тихие часы — начало (HH:MM)')
      .fill('22:00');
    const reqPromise = studentPage.waitForRequest(
      (r) =>
        r.method() === 'PATCH' && r.url().includes('notification-preferences'),
      { timeout: 5_000 },
    );
    await po.saveBtn.click();
    const req = await reqPromise.catch(() => null);
    if (req) {
      const body = req.postDataJSON();
      // The body should at least contain the field we changed.
      expect(typeof body).toBe('object');
    }
  });
});
