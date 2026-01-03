/**
 * Admin user actions: disable / enable / anonymize / reset password / force logout.
 */
import { test, expect } from '../../setup/fixtures';
import { UsersListPo, UserCreatePo } from '../../pages/admin/UsersPage.po';
import { uniqueEmail } from '../../helpers/factories';
import { waitForToast } from '../../helpers/waits';

async function createSubject(page: import('@playwright/test').Page): Promise<string> {
  const create = new UserCreatePo(page);
  await create.goto();
  const email = uniqueEmail('e2e-action');
  await create.emailInput.fill(email);
  await create.nameInput.fill(`Action ${email}`);
  await create.submit.click();
  await page.waitForURL(/\/admin\/users\/[^/]+/, { timeout: 15_000 });
  return email;
}

test.describe('Admin user actions', () => {
  test('disable then enable toggles status', async ({ adminPage }) => {
    const email = await createSubject(adminPage);
    const list = new UsersListPo(adminPage);
    await list.goto();
    await list.search.fill(email);
    await expect(list.row(email)).toBeVisible({ timeout: 10_000 });

    await list.actionsTrigger(email).click();
    await list.actionDisable(email).click();
    await waitForToast(adminPage, /заблокирован|disabled/i, 10_000);

    // Re-open menu, choose Enable.
    await list.search.fill(email);
    await expect(list.row(email)).toBeVisible({ timeout: 10_000 });
    await list.actionsTrigger(email).click();
    await list.actionEnable(email).click();
    await waitForToast(adminPage, /разблокирован|enabled/i, 10_000);
  });

  test('reset password fires success toast', async ({ adminPage }) => {
    const email = await createSubject(adminPage);
    const list = new UsersListPo(adminPage);
    await list.goto();
    await list.search.fill(email);
    await expect(list.row(email)).toBeVisible({ timeout: 10_000 });
    await list.actionsTrigger(email).click();
    await list.actionResetPassword(email).click();
    await waitForToast(adminPage, /reset|сброшен|отправлен/i, 10_000);
  });

  test('force logout fires success toast', async ({ adminPage }) => {
    const email = await createSubject(adminPage);
    const list = new UsersListPo(adminPage);
    await list.goto();
    await list.search.fill(email);
    await expect(list.row(email)).toBeVisible({ timeout: 10_000 });
    await list.actionsTrigger(email).click();
    await list.actionForceLogout(email).click();
    await waitForToast(adminPage, /сесси|logged out|завершен/i, 10_000);
  });

  test('anonymize requires explicit confirmation in destructive dialog', async ({ adminPage }) => {
    const email = await createSubject(adminPage);
    const list = new UsersListPo(adminPage);
    await list.goto();
    await list.search.fill(email);
    await list.actionsTrigger(email).click();
    await list.actionAnonymize(email).click();
    // Dialog must mention "необратимо" or "irreversible".
    const warning = adminPage.getByText(/необратим|irreversible|нельзя отменить/i).first();
    await expect(warning).toBeVisible({ timeout: 5_000 });
    // Cancel — user remains intact.
    await adminPage.getByTestId('confirm-dialog-cancel').click();
    await expect(list.row(email)).toBeVisible({ timeout: 5_000 });
  });

  test('anonymize confirm produces toast', async ({ adminPage }) => {
    const email = await createSubject(adminPage);
    const list = new UsersListPo(adminPage);
    await list.goto();
    await list.search.fill(email);
    await list.actionsTrigger(email).click();
    await list.actionAnonymize(email).click();
    await adminPage.getByTestId('confirm-dialog-confirm').click();
    await waitForToast(adminPage, /анонимизирован|anonymized/i, 15_000);
  });
});
