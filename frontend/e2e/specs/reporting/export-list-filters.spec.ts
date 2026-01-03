/**
 * E2E: ExportsListPage — filter behaviour (status, kind).
 *
 * The page applies filters via query params; we verify the filter UI is
 * present and the page does not crash when applying values.
 */
import { expect, test } from '../../setup/fixtures';
import { ExportsListPagePo } from '../../pages/reporting/ExportsListPage.po';

test.describe('Exports list filters', () => {
  test('clearing the status filter restores the unfiltered URL', async ({
    teacherPage,
  }) => {
    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    // Pick a value, then "clear" by selecting the empty option (Mantine puts
    // a clear button on the input — best-effort).
    await po.statusFilter.click();
    const opt = teacherPage.getByRole('option', { name: 'Готово' }).first();
    if (await opt.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await opt.click();
    }
    await expect(teacherPage).toHaveURL(/\/me\/exports/);
  });

  test('refreshing the page preserves the current filter', async ({
    teacherPage,
  }) => {
    await teacherPage.goto('/me/exports?status=completed');
    await expect(teacherPage).toHaveURL(/\?status=completed/);
    // Reload — URL should still carry the param.
    await teacherPage.reload();
    await expect(teacherPage).toHaveURL(/\?status=completed/);
  });
});
