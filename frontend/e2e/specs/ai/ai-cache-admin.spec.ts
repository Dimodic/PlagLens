/**
 * AI — admin cache stats + purge actions.
 */
import { test, expect } from '../../setup/fixtures';
import { CachePage } from '../../pages/ai/CachePage';
import { mockJson } from '../../helpers/plagAi';

test.describe('AI / admin / cache', () => {
  test('renders stats and per-prompt-version table', async ({ adminPage }) => {
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/cache\/stats/, {
      total_entries: 42,
      size_bytes: 1024 * 1024 * 3,
      hit_rate: 0.65,
      by_prompt_version: { v1: 30, v2: 12 },
    });
    const page = new CachePage(adminPage);
    await page.open();
    await expect(page.statEntries).toContainText('42');
    await expect(page.statHitRate).toContainText('65');
    await expect(adminPage.getByText('v1')).toBeVisible();
    await expect(adminPage.getByText('v2')).toBeVisible();
  });

  test('purge by prompt-version triggers DELETE', async ({ adminPage }) => {
    let deleted = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/cache\/stats/, {
      total_entries: 10,
      size_bytes: 1024,
      hit_rate: 0.5,
      by_prompt_version: { v1: 10 },
    });
    await adminPage.route(
      /\/api\/v1\/admin\/ai\/cache\/by-prompt-version\/v1$/,
      async (route) => {
        deleted++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );
    const page = new CachePage(adminPage);
    await page.open();
    await page.purgePromptButton('v1').click();
    await adminPage.getByTestId('confirm-dialog-confirm').click();
    await adminPage.waitForTimeout(200);
    expect(deleted).toBe(1);
  });

  test('purge by submission triggers DELETE', async ({ adminPage }) => {
    let deleted = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/cache\/stats/, {
      total_entries: 0,
      size_bytes: 0,
      hit_rate: 0,
      by_prompt_version: {},
    });
    await adminPage.route(
      /\/api\/v1\/admin\/ai\/cache\/by-submission\/sub_test$/,
      async (route) => {
        deleted++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );

    const page = new CachePage(adminPage);
    await page.open();
    await page.submissionInput.fill('sub_test');
    await page.purgeSubmissionButton.click();
    await adminPage.waitForTimeout(200);
    expect(deleted).toBe(1);
  });

  test('purge-all confirmation flow triggers DELETE /admin/ai/cache', async ({
    adminPage,
  }) => {
    let deleted = 0;
    await mockJson(adminPage, /\/api\/v1\/admin\/ai\/cache\/stats/, {
      total_entries: 5,
      size_bytes: 100,
      hit_rate: 0.3,
      by_prompt_version: {},
    });
    await adminPage.route(/\/api\/v1\/admin\/ai\/cache$/, async (route) => {
      if (route.request().method() === 'DELETE') {
        deleted++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
        return;
      }
      await route.continue();
    });

    const page = new CachePage(adminPage);
    await page.open();
    await page.purgeAllButton.click();
    await adminPage.getByTestId('confirm-dialog-confirm').click();
    await adminPage.waitForTimeout(200);
    expect(deleted).toBe(1);
  });
});
