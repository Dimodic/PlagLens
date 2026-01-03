/**
 * /admin/users/:id — tabs Profile/External/OAuth/Sessions/Audit.
 */
import { test, expect } from '../../setup/fixtures';
import { UsersListPo, UserDetailPo } from '../../pages/admin/UsersPage.po';

async function openUser(page: import('@playwright/test').Page, email: string): Promise<void> {
  const list = new UsersListPo(page);
  await list.goto();
  await list.search.fill(email);
  await expect(list.row(email)).toBeVisible({ timeout: 10_000 });
  await list.actionsTrigger(email).click();
  await list.actionView(email).click();
  await page.waitForURL(/\/admin\/users\/[^/]+/, { timeout: 10_000 });
}

test.describe('Admin user detail — tabs', () => {
  test('all five tabs render headers correctly', async ({ adminPage }) => {
    await openUser(adminPage, 'student1@demo.local');
    const detail = new UserDetailPo(adminPage);
    await expect(detail.tabProfile).toBeVisible();
    await expect(detail.tabBindings).toBeVisible();
    await expect(detail.tabOAuth).toBeVisible();
    await expect(detail.tabSessions).toBeVisible();
    await expect(detail.tabAudit).toBeVisible();
  });

  test('Profile tab shows email field disabled', async ({ adminPage }) => {
    await openUser(adminPage, 'student1@demo.local');
    const detail = new UserDetailPo(adminPage);
    await detail.tabProfile.click();
    const emailInput = adminPage.getByLabel('Email').first();
    await expect(emailInput).toBeDisabled();
  });

  test('Bindings tab renders without errors', async ({ adminPage }) => {
    await openUser(adminPage, 'student1@demo.local');
    const detail = new UserDetailPo(adminPage);
    await detail.tabBindings.click();
    // Either bindings list or "Привязок нет"
    await expect(
      adminPage.getByText(/Привязок нет|Stepik|Yandex/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('OAuth tab renders without errors', async ({ adminPage }) => {
    await openUser(adminPage, 'student1@demo.local');
    const detail = new UserDetailPo(adminPage);
    await detail.tabOAuth.click();
    await expect(
      adminPage.getByText(/Нет привязанных OAuth|Google|Yandex|Stepik|GitHub/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Sessions tab renders SessionsTable or empty state', async ({ adminPage }) => {
    await openUser(adminPage, 'student1@demo.local');
    const detail = new UserDetailPo(adminPage);
    await detail.tabSessions.click();
    await expect(
      adminPage.getByText(/Активных сессий нет|IP|User-Agent/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Audit tab links to actor audit page', async ({ adminPage }) => {
    await openUser(adminPage, 'student1@demo.local');
    const detail = new UserDetailPo(adminPage);
    await detail.tabAudit.click();
    const link = adminPage.getByRole('link', { name: /открыть аудит пользователя/i });
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    await adminPage.waitForURL(/\/admin\/audit\/actors\//, { timeout: 10_000 });
  });
});
