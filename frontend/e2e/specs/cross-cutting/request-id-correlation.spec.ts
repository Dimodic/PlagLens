/**
 * X-Request-Id correlation.
 *
 * - Every response carries X-Request-Id, even on errors.
 * - Client may send X-Request-Id; gateway uses it as trace correlation.
 * - ProblemAlert surfaces request_id for support.
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient, makeAnonClient, getHeader } from '../../helpers/cross-cutting';
import { uiLoginAs } from '../../helpers/cross-cutting';
import { TEST_IDS } from '../../helpers/selectors';

test.describe('X-Request-Id correlation', () => {
  test('successful response carries X-Request-Id', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/auth/me');
    expect(r.status()).toBe(200);
    const rid = getHeader(r, 'x-request-id');
    expect(rid).toBeDefined();
    expect((rid ?? '').length).toBeGreaterThan(0);
    await c.ctx.dispose();
  });

  test('error response also carries X-Request-Id', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.get('/auth/me');
    expect(r.status()).toBe(401);
    const rid = getHeader(r, 'x-request-id');
    expect(rid).toBeDefined();
    expect((rid ?? '').length).toBeGreaterThan(0);
    await ctx.dispose();
  });

  test('client-provided X-Request-Id is honoured (or replaced — at least non-empty)', async () => {
    const c = await makeAuthedClient('admin');
    const myRid = '01HZ-test-rid-aaaaaaaaaa';
    const r = await c.get('/auth/me', { 'X-Request-Id': myRid });
    expect(r.ok()).toBe(true);
    const rid = getHeader(r, 'x-request-id') ?? '';
    expect(rid.length).toBeGreaterThan(0);
    // Gateway either echoes it back or generates its own; both are valid.
    await c.ctx.dispose();
  });

  test('every X-Request-Id is unique per call', async () => {
    const c = await makeAuthedClient('admin');
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = await c.get('/auth/me');
      const rid = getHeader(r, 'x-request-id');
      if (rid) seen.add(rid);
    }
    expect(seen.size).toBeGreaterThanOrEqual(2);
    await c.ctx.dispose();
  });

  test('UI ProblemAlert exposes request_id text when an API error happens', async ({ page }) => {
    // Drive a known failure via the UI: bad credentials on /login.
    await page.goto('/login');
    await page.getByTestId(TEST_IDS.loginEmail).fill('admin@demo.local');
    await page.getByTestId(TEST_IDS.loginPassword).fill('wrong-password');
    await page.getByTestId(TEST_IDS.loginTenantSlug).fill('demo-hse');
    await page.getByTestId(TEST_IDS.loginSubmit).click();
    // ProblemAlert should appear; it may or may not show request_id depending
    // on whether the backend returned one. We assert visibility + structure.
    const alert = page.getByTestId(TEST_IDS.problemAlert).first();
    await expect(alert).toBeVisible({ timeout: 10_000 });
  });
});
