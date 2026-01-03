/**
 * E2E: /me/exports — ExportsListPage
 *
 * Verifies the list, status filter and "Новый экспорт" entry point.
 */
import { expect, test } from '../../setup/fixtures';
import { ExportsListPagePo } from '../../pages/reporting/ExportsListPage.po';

test.describe('Exports list', () => {
  test('teacher can open /me/exports and see either rows or empty state', async ({
    teacherPage,
  }) => {
    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    await expect(teacherPage).toHaveURL(/\/me\/exports/);
    // Either the table is rendered (any prior export) or empty-state CTA.
    const tableVisible = await po.table.isVisible().catch(() => false);
    if (!tableVisible) {
      await expect(teacherPage.getByText(/Нет экспортов/)).toBeVisible();
    }
    // Status filter is always rendered.
    await expect(po.statusFilter).toBeVisible();
    await expect(po.newExportBtn).toBeVisible();
  });

  test('clicking "Новый экспорт" opens the create modal', async ({
    teacherPage,
  }) => {
    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    await po.openCreateModal();
    // Mantine v7 portals the dialog content; assert against the dialog role.
    const dialog = teacherPage.getByRole('dialog', { name: 'Создать экспорт' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('export-create-form')).toBeVisible();
    await expect(dialog.getByTestId('export-kind-select')).toBeVisible();
    await expect(dialog.getByTestId('export-format-select')).toBeVisible();
    await expect(dialog.getByTestId('export-submit-btn')).toBeVisible();
  });

  test('cancel button closes the modal without submitting', async ({
    teacherPage,
  }) => {
    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    await po.openCreateModal();
    const dialog = teacherPage.getByRole('dialog', { name: 'Создать экспорт' });
    await dialog.getByTestId('export-cancel-btn').click();
    await expect(dialog).toBeHidden();
  });

  test('status filter remains stable when applying a value', async ({
    teacherPage,
  }) => {
    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    // Mantine Select: click then choose option.
    await po.statusFilter.click();
    const opt = teacherPage.getByRole('option', { name: 'Готово' }).first();
    if (await opt.isVisible().catch(() => false)) {
      await opt.click();
      // List re-renders. The page should not throw / navigate away.
      await expect(teacherPage).toHaveURL(/\/me\/exports/);
    }
  });
});
