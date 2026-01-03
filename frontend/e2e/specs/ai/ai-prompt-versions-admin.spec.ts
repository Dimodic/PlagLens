/**
 * AI — admin prompt versions: list, activate, sandbox-test.
 */
import { test, expect } from '../../setup/fixtures';
import { PromptVersionsPage } from '../../pages/ai/PromptVersionsPage';
import { mockJson, makePromptVersion } from '../../helpers/plagAi';

test.describe('AI / admin / prompt versions', () => {
  test('lists versions with active badge', async ({ adminPage }) => {
    const v1 = makePromptVersion({ id: 'v1', active_for_tenant: true });
    const v2 = makePromptVersion({
      id: 'v2',
      name: 'Stricter 2026',
      active_for_tenant: false,
    });
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/prompt-versions(\?|$)/, {
      data: [v1, v2],
      total: 2,
    });

    const page = new PromptVersionsPage(adminPage);
    await page.open();
    await expect(page.list).toBeVisible();
    await expect(page.card('v1')).toContainText(/active/);
    await expect(page.card('v2')).not.toContainText(/active/);
  });

  test('activate calls :activate endpoint', async ({ adminPage }) => {
    const v2 = makePromptVersion({
      id: 'v2',
      name: 'Stricter 2026',
      active_for_tenant: false,
    });
    let activated = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/prompt-versions(\?|$)/, {
      data: [v2],
      total: 1,
    });
    await adminPage.route(
      /\/api\/v1\/admin\/ai\/prompt-versions\/[^/]+:activate/,
      async (route) => {
        activated++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ...v2, active_for_tenant: true }),
        });
      },
    );

    const page = new PromptVersionsPage(adminPage);
    await page.open();
    await page.activateButton('v2').click();
    await adminPage.waitForTimeout(200);
    expect(activated).toBe(1);
  });

  test('sandbox runs prompt and renders result', async ({ adminPage }) => {
    const v1 = makePromptVersion({ id: 'v1', active_for_tenant: true });
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/prompt-versions(\?|$)/, {
      data: [v1],
      total: 1,
    });
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/prompt-versions\/v1$/, v1);
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/prompt-versions\/v1:test/, {
      report: {
        summary: 'Тестовый ответ',
        risk_signals: [],
        questions: ['Q1'],
        recommendations: ['R1'],
      },
      raw_response: '{"summary":"Тестовый ответ"}',
      tokens_used: 120,
      cost_estimate: 0.001,
      latency_ms: 800,
    });

    const page = new PromptVersionsPage(adminPage);
    await page.open();
    await page.openButton('v1').click();
    // Switch to Sandbox tab.
    await adminPage.getByRole('tab', { name: /Sandbox/i }).click();
    await page.sandboxCode.fill('def f():\n    return 1\n');
    await page.sandboxRun.click();
    await expect(page.sandboxResult).toBeVisible();
    await expect(adminPage.getByText(/Тестовый ответ/).first()).toBeVisible();
    await expect(adminPage.getByText(/120/).first()).toBeVisible();
  });

  test('non-admin cannot access /admin/ai/prompt-versions', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/ai/prompt-versions');
    await expect(teacherPage.getByText(/404|не найдено|Page not found/i).first())
      .toBeVisible({ timeout: 5_000 });
  });
});
