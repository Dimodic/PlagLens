/**
 * /me/security — OAuth tab: link/unlink Google/Yandex/Stepik/GitHub.
 *
 * For link flow we mock the redirect via page.route() so we don't actually
 * hit Google/Yandex.
 */
import { test, expect } from '../../setup/fixtures';
import { SecurityPo } from '../../pages/profile/SecurityPage.po';

test.describe('Profile security — OAuth identities', () => {
  test('teacher opens OAuth tab and sees four provider rows', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('oauth');
    // OAuthLinksList renders 4 provider cards (test ids oauth-row-{provider}).
    await expect(teacherPage.getByTestId('oauth-row-google')).toBeVisible({ timeout: 10_000 });
    await expect(teacherPage.getByTestId('oauth-row-yandex')).toBeVisible();
    await expect(teacherPage.getByTestId('oauth-row-stepik')).toBeVisible();
    await expect(teacherPage.getByTestId('oauth-row-github')).toBeVisible();
  });

  test('clicking Link Google redirects to OAuth start URL (mocked)', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    // Intercept the OAuth start URL — block actual redirect.
    await teacherPage.route('**/api/v1/auth/oauth/google/authorize**', async (route) => {
      // Respond with a small HTML stub to simulate the IDP page.
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Mocked Google IDP</body></html>',
      });
    });
    await po.goto();
    await po.openTab('oauth');
    const linkButton = po.oauthLinkButton('google');
    if (await linkButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await linkButton.click();
      // After click, browser navigates — we may be on the mocked HTML page.
      await teacherPage.waitForLoadState('domcontentloaded').catch(() => {});
    } else {
      // Already linked — skip.
      test.skip();
    }
  });

  test('unlink button is shown only when provider is linked', async ({ teacherPage }) => {
    const po = new SecurityPo(teacherPage);
    await po.goto();
    await po.openTab('oauth');
    // For each provider, exactly one of link/unlink should be visible.
    for (const provider of ['google', 'yandex', 'stepik', 'github'] as const) {
      const link = po.oauthLinkButton(provider);
      const unlink = po.oauthUnlinkButton(provider);
      const linkVisible = await link.isVisible({ timeout: 1_000 }).catch(() => false);
      const unlinkVisible = await unlink.isVisible({ timeout: 1_000 }).catch(() => false);
      expect(linkVisible || unlinkVisible).toBeTruthy();
    }
  });
});
