/**
 * /admin/users/new — single create + bulk-invite tab.
 */
import { test, expect } from '../../setup/fixtures';
import { UserCreatePo, UsersListPo } from '../../pages/admin/UsersPage.po';
import { uniqueEmail } from '../../helpers/factories';
import { waitForToast } from '../../helpers/waits';

test.describe('Admin users — create / bulk invite', () => {
  test('admin creates a single user and is redirected to detail', async ({ adminPage }) => {
    const po = new UserCreatePo(adminPage);
    await po.goto();
    const email = uniqueEmail('e2e-single');
    await po.emailInput.fill(email);
    await po.nameInput.fill('E2E Tester');
    await po.submit.click();
    // After create -> redirect to /admin/users/<id>
    await adminPage.waitForURL(/\/admin\/users\/[^/]+/, { timeout: 15_000 });
    await expect(adminPage.getByText('E2E Tester').first()).toBeVisible({ timeout: 10_000 });
  });

  test('single create with invalid email shows Problem alert', async ({ adminPage }) => {
    const po = new UserCreatePo(adminPage);
    await po.goto();
    await po.emailInput.fill('not-an-email');
    await po.nameInput.fill('Bogus');
    await po.submit.click();
    await expect(adminPage.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
    expect(adminPage.url()).toContain('/admin/users/new');
  });

  test('bulk-invite via paste of 5 email lines', async ({ adminPage }) => {
    const po = new UserCreatePo(adminPage);
    await po.goto();
    await po.tabBulk.click();
    const emails = Array.from({ length: 5 }, () => uniqueEmail('e2e-bulk'));
    await po.bulkEmails.fill(emails.join('\n'));
    await po.bulkSubmit.click();
    await waitForToast(adminPage, /приглашено|invited/i, 15_000);
  });

  test('bulk-invite with empty list shows Problem alert', async ({ adminPage }) => {
    const po = new UserCreatePo(adminPage);
    await po.goto();
    await po.tabBulk.click();
    await po.bulkEmails.fill('');
    await po.bulkSubmit.click();
    await expect(adminPage.getByRole('alert').first()).toBeVisible({ timeout: 5_000 });
  });

  test('bulk-invite accepts comma-separated list', async ({ adminPage }) => {
    const po = new UserCreatePo(adminPage);
    await po.goto();
    await po.tabBulk.click();
    const emails = Array.from({ length: 3 }, () => uniqueEmail('e2e-csv')).join(', ');
    await po.bulkEmails.fill(emails);
    await po.bulkSubmit.click();
    await waitForToast(adminPage, /приглашено|invited/i, 15_000);
  });

  test('after creation, user appears on /admin/users list', async ({ adminPage }) => {
    const create = new UserCreatePo(adminPage);
    await create.goto();
    const email = uniqueEmail('e2e-listed');
    await create.emailInput.fill(email);
    await create.nameInput.fill('Listed Tester');
    await create.submit.click();
    await adminPage.waitForURL(/\/admin\/users\/[^/]+/, { timeout: 15_000 });

    const list = new UsersListPo(adminPage);
    await list.goto();
    await list.search.fill(email);
    await expect(list.row(email)).toBeVisible({ timeout: 10_000 });
  });
});
