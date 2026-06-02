/**
 * /admin/roles — read-only Roles × Permissions matrix.
 */
import { test, expect } from '../../setup/fixtures';
import { RolesPermissionsPo } from '../../pages/admin/SystemPage.po';

test.describe('Admin — roles/permissions matrix', () => {
  test('admin opens matrix page and sees title and table', async ({ adminPage }) => {
    const po = new RolesPermissionsPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText(/Roles & permissions/i).first()).toBeVisible();
    await expect(adminPage.getByText('Roles × Permissions').first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('matrix lists all 4 roles in header', async ({ adminPage }) => {
    const po = new RolesPermissionsPo(adminPage);
    await po.goto();
    for (const role of ['admin', 'teacher', 'assistant', 'student']) {
      await expect(adminPage.getByRole('columnheader', { name: role })).toBeVisible({
        timeout: 10_000,
      });
    }
  });

  test('matrix has at least the documented permissions', async ({ adminPage }) => {
    const po = new RolesPermissionsPo(adminPage);
    await po.goto();
    for (const perm of [
      'auth.manage_users',
      'auth.manage_tenants',
      'courses.create',
      'submissions.grade',
      'plagiarism.run',
      'ai.run',
      'audit.view',
    ]) {
      await expect(adminPage.getByText(perm).first()).toBeVisible({ timeout: 5_000 });
    }
  });
});
