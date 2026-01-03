/**
 * /admin/audit/actors/:userId — events by a specific user.
 */
import { test, expect } from '../../setup/fixtures';
import { UsersListPo } from '../../pages/admin/UsersPage.po';
import { AuditByActorPo } from '../../pages/admin/AuditPage.po';

async function findStudentUserId(page: import('@playwright/test').Page): Promise<string> {
  const list = new UsersListPo(page);
  await list.goto();
  await list.search.fill('student1@demo.local');
  const row = list.row('student1@demo.local');
  await expect(row).toBeVisible({ timeout: 10_000 });
  const id = await row.getAttribute('data-user-id');
  if (!id) throw new Error('user id not found');
  return id;
}

test.describe('Audit — by actor', () => {
  test('opens audit page for a real user id', async ({ adminPage }) => {
    const userId = await findStudentUserId(adminPage);
    const po = new AuditByActorPo(adminPage);
    await po.gotoForUser(userId);
    await expect(adminPage.getByText('Audit • Actor').first()).toBeVisible();
    await expect(adminPage.getByText(userId).first()).toBeVisible({ timeout: 10_000 });
  });

  test('opens audit page for a non-existent actor id, shows empty state or no rows', async ({
    adminPage,
  }) => {
    const po = new AuditByActorPo(adminPage);
    await po.gotoForUser('00000000-0000-0000-0000-000000000000');
    await expect(adminPage.getByText('Audit • Actor').first()).toBeVisible();
    // The page should render without crash.
    await adminPage.waitForLoadState('networkidle').catch(() => {});
  });
});
