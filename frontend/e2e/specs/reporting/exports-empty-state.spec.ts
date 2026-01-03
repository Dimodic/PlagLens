/**
 * E2E: ExportsListPage empty state.
 *
 * When the API returns an empty list, the page shows an EmptyState card
 * with the "Создайте первый экспорт" message instead of the table.
 */
import { expect, test } from '../../setup/fixtures';

test.describe('Exports list empty state (mocked)', () => {
  test('empty list shows the call-to-action card', async ({ teacherPage }) => {
    await teacherPage.route(/\/api\/v1\/exports(\?|$)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [],
          pagination: { has_more: false, next_cursor: null, limit: 50 },
        }),
      });
    });
    await teacherPage.goto('/me/exports');
    await expect(teacherPage.getByText(/Нет экспортов/)).toBeVisible({
      timeout: 10_000,
    });
  });
});
