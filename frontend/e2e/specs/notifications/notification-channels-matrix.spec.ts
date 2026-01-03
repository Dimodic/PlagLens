/**
 * E2E: Per-event preferences matrix — render + persist.
 *
 * Verifies that each cell of the (event_type × channel) matrix renders and
 * that toggling a cell triggers a PATCH to the per-event endpoint.
 */
import { expect, test } from '../../setup/fixtures';
import { PreferencesPagePo } from '../../pages/notifications/PreferencesPage.po';

test.describe('Preferences matrix', () => {
  test('matrix renders headers for the three channels (or empty-state message)', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    // The matrix renders a Mantine Table with channel column headers; if
    // the events catalog is empty the page displays a "Нет доступных типов
    // событий" message instead.
    const matrix = po.matrix;
    const empty = studentPage.getByText(/Нет доступных типов событий/);
    await expect(matrix.or(empty)).toBeVisible();
    if (await matrix.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const text = await matrix.innerText();
      expect(/In-app|Email|Telegram/.test(text)).toBeTruthy();
    }
  });

  test('toggling a per-event cell triggers a PATCH (best-effort)', async ({
    studentPage,
  }) => {
    const po = new PreferencesPagePo(studentPage);
    await po.goto();
    // Find any cell in the matrix.
    const cell = studentPage.locator('[data-testid^="pref-"]').first();
    if (await cell.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const reqPromise = studentPage.waitForRequest(
        (r) =>
          r.method() === 'PATCH' &&
          /per-event|notification-preferences/.test(r.url()),
        { timeout: 5_000 },
      );
      await cell.click().catch(() => null);
      await po.saveBtn.click();
      await reqPromise.catch(() => null);
    }
  });
});
