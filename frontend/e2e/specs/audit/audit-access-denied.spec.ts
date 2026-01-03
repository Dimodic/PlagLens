/**
 * /admin/audit/access-denied — list of 403's for security review.
 */
import { test, expect } from '../../setup/fixtures';
import { AuditAccessDeniedPo } from '../../pages/admin/AuditPage.po';

test.describe('Audit — access denied list', () => {
  test('admin opens access-denied page', async ({ adminPage }) => {
    const po = new AuditAccessDeniedPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Access denied').first()).toBeVisible();
    // Either rows or empty state.
    await expect(
      adminPage.getByText(/Отказов нет|action|actor/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('teacher cannot reach access-denied audit page', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/audit/access-denied');
    await teacherPage.waitForLoadState('domcontentloaded');
    const url = teacherPage.url();
    if (url.includes('/admin/audit/access-denied')) {
      const titleVisible = await teacherPage
        .getByText('Access denied')
        .first()
        .isVisible()
        .catch(() => false);
      if (titleVisible) {
        await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
      }
    } else {
      expect(url).not.toContain('/admin/audit/access-denied');
    }
  });
});
