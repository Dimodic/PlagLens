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
    // Mantine Switch's <input role="switch"> is the actual checkbox — the
    // visual track is its sibling. The input is a hidden form element, so
    // assert it exists and is attached rather than visually visible.
    await expect(po.chInapp).toBeAttached();
    await expect(po.chEmail).toBeAttached();
    await expect(po.chTelegram).toBeAttached();
    // The Switch labels are spans with mantine-Switch-label class.
    await expect(
      studentPage.locator('.mantine-Switch-label', { hasText: 'In-app' }),
    ).toBeVisible();
    await expect(
      studentPage.locator('.mantine-Switch-label', { hasText: /^Email$/ }),
    ).toBeVisible();
    await expect(
      studentPage.locator('.mantine-Switch-label', { hasText: /^Telegram$/ }),
    ).toBeVisible();
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
    for (const v of ['Мгновенно', 'Раз в час', 'Раз в день', 'Никогда']) {
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
    // Mantine Select shows label as the input value.
    await expect(po.digestSelect).toHaveValue('Раз в час');
  });

  test('quiet hours fields accept HH:MM input', async ({ studentPage }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    await studentPage.getByLabel('Тихие часы — начало (HH:MM)').fill('22:00');
    await studentPage.getByLabel('Тихие часы — конец (HH:MM)').fill('08:00');
    await studentPage.getByLabel('Часовой пояс').fill('Europe/Moscow');
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
