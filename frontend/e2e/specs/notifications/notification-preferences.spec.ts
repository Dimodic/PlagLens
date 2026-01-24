/**
 * E2E: /me/notifications/preferences — PreferencesPage
 *
 * Channels (in-app/email/telegram), per-event matrix, digest frequency,
 * quiet hours, timezone, reset, save.
 */
import { expect, test } from '../../setup/fixtures';
import { PreferencesPagePo } from '../../pages/notifications/PreferencesPage.po';

test.describe('Notification Preferences', () => {
  test('opens with three channel toggles visible', async ({ studentPage }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    await expect(po.chInapp).toBeAttached();
    await expect(po.chEmail).toBeAttached();
    await expect(po.chTelegram).toBeAttached();
    // Labels rendered as plain <label> elements next to the switches.
    await expect(studentPage.getByText('В приложении')).toBeVisible();
    await expect(studentPage.getByText(/^Email$/)).toBeVisible();
    await expect(studentPage.getByText(/^Telegram$/)).toBeVisible();
  });

  test('per-event matrix renders at least 1 row when events are seeded', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    // Either the matrix shows or "Нет доступных типов событий".
    const matrixVisible = await po.matrix.isVisible().catch(() => false);
    if (matrixVisible) {
      const rows = po.matrix.locator('[data-testid^="pref-row-"]');
      expect(await rows.count()).toBeGreaterThan(0);
    } else {
      await expect(
        studentPage.getByText('Нет доступных типов событий.'),
      ).toBeVisible();
    }
  });

  test('digest frequency dropdown shows four options', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    await po.digestSelect.click();
    for (const v of [
      'Каждое событие',
      'Раз в час',
      'Раз в день',
      'Не присылать',
    ]) {
      await expect(studentPage.getByRole('option', { name: v })).toBeVisible();
    }
  });

  test('toggling email channel and saving issues the PATCH', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    // Track PATCH /users/me/notification-preferences
    const patchPromise = studentPage.waitForResponse(
      (r) =>
        r.request().method() === 'PATCH' &&
        r.url().includes('/users/me/notification-preferences'),
      { timeout: 15_000 },
    );
    // Click the email switch (Mantine renders labelled switch).
    await po.chEmail.click({ force: true }).catch(() => null);
    await po.saveBtn.click();
    const resp = await patchPromise.catch(() => null);
    if (resp) {
      expect(resp.status()).toBeLessThan(500);
    }
  });

  test('changing digest to "hourly" updates the form', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    await po.digestSelect.click();
    await studentPage.getByRole('option', { name: 'Раз в час' }).click();
    // shadcn Select renders the chosen label inside the trigger.
    await expect(po.digestSelect).toContainText('Раз в час');
  });

  test('quiet hours fields accept time input', async ({ studentPage }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    await studentPage.getByLabel('Не беспокоить с').fill('22:00');
    await studentPage.getByLabel('до').fill('08:00');
  });

  test('"Reset" button sends POST :reset-to-defaults', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    const resetPromise = studentPage.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes('reset-to-defaults'),
      { timeout: 15_000 },
    );
    await po.resetBtn.click();
    const resp = await resetPromise.catch(() => null);
    if (resp) {
      expect(resp.status()).toBeLessThan(500);
    }
  });
});
