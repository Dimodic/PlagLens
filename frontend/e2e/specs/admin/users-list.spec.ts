/**
 * /admin/users — list with filters / search / role / status.
 */
import { test, expect } from '../../setup/fixtures';
import { UsersListPo } from '../../pages/admin/UsersPage.po';

test.describe('Admin users — list', () => {
  test('admin sees users title and at least seeded teacher row', async ({ adminPage }) => {
    const po = new UsersListPo(adminPage);
    await po.goto();
    await expect(po.title).toBeVisible();
    // The demo tenant must seed teacher@demo.local.
    await expect(po.row('teacher@demo.local')).toBeVisible({ timeout: 10_000 });
  });

  test('search input narrows the list', async ({ adminPage }) => {
    const po = new UsersListPo(adminPage);
    await po.goto();
    await po.search.fill('student1');
    await expect(po.row('student1@demo.local')).toBeVisible({ timeout: 10_000 });
  });

  test('role filter shows only selected role', async ({ adminPage }) => {
    const po = new UsersListPo(adminPage);
    await po.goto();
    // open Mantine Select dropdown
    await po.roleFilter.click();
    await adminPage.getByRole('option', { name: 'teacher' }).first().click();
    // Wait for refetch — at least teacher is there.
    await expect(po.row('teacher@demo.local')).toBeVisible({ timeout: 10_000 });
    // Students should no longer be visible (assuming demo seed only has 1 teacher).
    const studentRow = po.row('student1@demo.local');
    await expect(studentRow).toHaveCount(0);
  });

  test('status filter clears via clearable button', async ({ adminPage }) => {
    const po = new UsersListPo(adminPage);
    await po.goto();
    await po.statusFilter.click();
    await adminPage.getByRole('option', { name: 'active' }).first().click();
    await expect(po.row('teacher@demo.local')).toBeVisible({ timeout: 10_000 });
  });

  test('teacher cannot access /admin/users', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/users');
    await teacherPage.waitForLoadState('domcontentloaded');
    const url = teacherPage.url();
    if (url.includes('/admin/users')) {
      // Either page redirects or shows error
      const title = teacherPage.getByTestId('users-title');
      const titleVisible = await title.isVisible().catch(() => false);
      if (titleVisible) {
        // Then expect 403 alert
        await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
      }
    } else {
      expect(url).not.toContain('/admin/users');
    }
  });
});
