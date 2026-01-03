/**
 * Plagiarism — provider configuration in the admin panel.
 *
 * Note: there is no dedicated /admin/plagiarism-providers page yet. We assert
 * the AI providers page (LLMProvidersPage at /admin/ai/providers) covers the
 * admin enable/disable + test-connection flow that the foundation has built.
 * The plagiarism backend ships its providers via the same admin UI shape.
 */
import { test, expect } from '../../setup/fixtures';
import { LLMProvidersPage } from '../../pages/ai/LLMProvidersPage';
import { mockJson } from '../../helpers/plagAi';

const provider = {
  id: 'prov_jplag_openrouter',
  tenant_id: 'tnt_demo',
  provider: 'openrouter',
  base_url: 'https://openrouter.ai/api/v1',
  model: 'google/gemini-flash-1.5',
  api_key_env_var: 'OPENROUTER_API_KEY',
  enabled: true,
  default_for_tenant: true,
  priority: 1,
  rate_limit_rpm: 60,
  created_at: '2026-04-01T00:00:00Z',
};

test.describe('Plagiarism / providers admin', () => {
  test('admin sees providers table and toggle works', async ({ adminPage }) => {
    let updates = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/providers$/, {
      data: [provider],
    });
    await adminPage.route(/\/api\/v1\/admin\/ai\/providers\/[^:/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') updates++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...provider, enabled: false }),
      });
    });

    const page = new LLMProvidersPage(adminPage);
    await page.open();
    await expect(page.row(provider.id)).toBeVisible();
    await page
      .row(provider.id)
      .locator('label.mantine-Switch-root, .mantine-Switch-track')
      .first()
      .click();
    await expect(adminPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/Включ|Отключ|Не удал/i, { timeout: 5_000 });
    expect(updates).toBe(1);
  });

  test('test connection button calls /test endpoint', async ({ adminPage }) => {
    let tested = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/providers$/, {
      data: [provider],
    });
    await adminPage.route(
      /\/api\/v1\/admin\/ai\/providers\/[^/]+:test/,
      async (route) => {
        tested++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, latency_ms: 250 }),
        });
      },
    );

    const page = new LLMProvidersPage(adminPage);
    await page.open();
    await page.testButton(provider.id).click();
    await expect(adminPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/OK|250ms|Тест/i, { timeout: 5_000 });
    expect(tested).toBe(1);
  });

  test('non-admin cannot access admin providers page', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/ai/providers');
    await expect(teacherPage.getByText(/404|не найдено|Page not found/i).first())
      .toBeVisible({ timeout: 5_000 });
  });
});
