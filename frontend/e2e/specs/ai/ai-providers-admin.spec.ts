/**
 * AI — admin providers list: edit, toggle, test, ensure API key value never
 * appears in the DOM.
 */
import { test, expect } from '../../setup/fixtures';
import { LLMProvidersPage } from '../../pages/ai/LLMProvidersPage';
import { mockJson } from '../../helpers/plagAi';

const PROV = {
  id: 'prov_or',
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

test.describe('AI / admin / providers', () => {
  test('list renders and api_key_env_var (env-var name only) is shown', async ({
    adminPage,
  }) => {
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/providers$/, { data: [PROV] });

    const page = new LLMProvidersPage(adminPage);
    await page.open();
    await expect(page.row(PROV.id)).toBeVisible();
    // Open edit modal.
    await page.editButton(PROV.id).click();
    await expect(page.editModal).toBeVisible();
    await expect(page.editApiKeyEnv).toHaveValue('OPENROUTER_API_KEY');
    // The actual key value must NEVER be present in the DOM.
    await expect(adminPage.locator('body')).not.toContainText(/sk-or-v1/i);
  });

  test('save dispatches PATCH with edited fields', async ({ adminPage }) => {
    let captured: unknown = null;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/providers$/, { data: [PROV] });
    await adminPage.route(
      new RegExp(`/api/v1/admin/ai/providers/${PROV.id}$`),
      async (route) => {
        if (route.request().method() === 'PATCH') {
          captured = route.request().postDataJSON();
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PROV),
        });
      },
    );

    const page = new LLMProvidersPage(adminPage);
    await page.open();
    await page.editButton(PROV.id).click();
    await page.editModel.fill('google/gemini-flash-1.5-8b');
    await page.editSave.click();
    await adminPage.waitForTimeout(200);
    expect(captured).toMatchObject({ model: 'google/gemini-flash-1.5-8b' });
  });

  test('toggle disables provider', async ({ adminPage }) => {
    let toggled = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/providers$/, { data: [PROV] });
    await adminPage.route(
      new RegExp(`/api/v1/admin/ai/providers/${PROV.id}$`),
      async (route) => {
        if (route.request().method() === 'PATCH') toggled++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...PROV, enabled: false }),
        });
      },
    );
    const page = new LLMProvidersPage(adminPage);
    await page.open();
    // Click the wrapper because Mantine v7 hides the inner <input>.
    await page
      .row(PROV.id)
      .locator('label.mantine-Switch-root, .mantine-Switch-track')
      .first()
      .click();
    await adminPage.waitForTimeout(200);
    expect(toggled).toBe(1);
  });

  test('test button calls :test endpoint', async ({ adminPage }) => {
    let tested = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/providers$/, { data: [PROV] });
    await adminPage.route(
      new RegExp(`/api/v1/admin/ai/providers/${PROV.id}:test`),
      async (route) => {
        tested++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, latency_ms: 200, model_response: 'ok' }),
        });
      },
    );
    const page = new LLMProvidersPage(adminPage);
    await page.open();
    await page.testButton(PROV.id).click();
    await adminPage.waitForTimeout(200);
    expect(tested).toBe(1);
  });
});
