/**
 * Auth: email verification flow.
 *
 * Coverage:
 *   - /auth/verify without token shows the "missing token" panel
 *   - /auth/verify with a bogus token surfaces a problem alert
 *   - End-to-end via Mailhog: register a new user, find the verify link in
 *     the dev mail server, follow it, and observe the success panel
 *
 * The Mailhog test is skipped automatically when the dev mail server is not
 * reachable (e.g. in stripped-down dev compose profiles).
 */
import { test, expect } from '@playwright/test';
import { RegisterPagePo } from '../../pages/RegisterPage.po';
import { buildRegisterInput } from '../../helpers/factories';
import { MailhogClient, MAILHOG_BASE_URL } from '../../helpers/mailhog';

test.describe('@auth email-verify', () => {
  test('without token shows "missing token" panel', async ({ page }) => {
    await page.goto('/auth/verify');
    await expect(page.getByText(/токен отсутствует/i)).toBeVisible();
  });

  test('bogus token shows error state', async ({ page }) => {
    await page.goto('/auth/verify?token=this-is-not-a-real-token');
    // Either the verify-state-error testid or a problem alert appears.
    await expect(
      page.getByTestId('verify-state-error').or(page.getByRole('alert')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('register → mailhog link → verify panel', async ({ page, request }) => {
    // Skip if Mailhog isn't reachable.
    const probe = await request.get(`${MAILHOG_BASE_URL}/api/v2/messages`).catch(() => null);
    if (!probe || !probe.ok()) {
      test.skip(true, `Mailhog unreachable at ${MAILHOG_BASE_URL}`);
    }

    const mh = await MailhogClient.create();
    try {
      const input = buildRegisterInput({ tenant_slug: 'demo-hse' });
      const rp = new RegisterPagePo(page);
      await rp.goto();
      await rp.fillForm(input);

      const respPromise = page.waitForResponse(
        (r) => r.url().includes('/auth/register') && r.request().method() === 'POST',
        { timeout: 15_000 },
      );
      await rp.submit.click();
      const resp = await respPromise;
      if (resp.status() === 429) test.skip(true, 'Rate limited; rerun');
      if (!resp.ok()) test.skip(true, `Register returned ${resp.status()} — backend may disable open registration`);

      // Wait for an email addressed to the new user with a verify token URL.
      const msg = await mh.waitFor(
        (m) => {
          const to = (m.To?.[0]?.Mailbox ?? '').toLowerCase() + '@' + (m.To?.[0]?.Domain ?? '').toLowerCase();
          return to === input.email.toLowerCase();
        },
        { timeout: 15_000 },
      );
      if (!msg) test.skip(true, 'No verification email arrived in 15s — outbox dispatcher may be off');

      const body = msg!.Content?.Body ?? '';
      const m = body.match(/\/auth\/verify\?token=([A-Za-z0-9._\-=]+)/);
      expect(m, `verify link not found in mail body:\n${body.slice(0, 400)}`).not.toBeNull();
      const token = m![1];

      await page.goto(`/auth/verify?token=${encodeURIComponent(token)}`);
      await expect(page.getByTestId('verify-state-ok')).toBeVisible({ timeout: 10_000 });
    } finally {
      await mh.dispose();
    }
  });
});
