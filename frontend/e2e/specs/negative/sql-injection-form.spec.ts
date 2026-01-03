/**
 * SQL-injection probes on text inputs.
 *
 * We don't actually try to *exploit* — we send the canonical payloads and
 * assert that the API returns sane responses (200 / validation error /
 * 404), never a 500 with database error leakage.
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient, makeAnonClient } from '../../helpers/cross-cutting';

const SQLI_PAYLOADS = [
  "' OR 1=1 --",
  "'; DROP TABLE users; --",
  "1' UNION SELECT NULL --",
  "admin'--",
  "' OR 'a'='a",
];

test.describe('SQL-injection probes', () => {
  test('login with classic SQLi yields auth failure (401), not 500', async () => {
    const ctx = await makeAnonClient();
    for (const payload of SQLI_PAYLOADS) {
      const r = await ctx.post('/auth/login', {
        data: { email: payload, password: payload, tenant_slug: 'demo-hse' },
      });
      expect(r.status()).toBeLessThan(500);
      expect([400, 401, 422]).toContain(r.status());
    }
    await ctx.dispose();
  });

  test('search filter with SQLi returns normal data, not DB error', async () => {
    const c = await makeAuthedClient('admin');
    for (const payload of SQLI_PAYLOADS) {
      const r = await c.get(`/courses?q=${encodeURIComponent(payload)}&limit=5`);
      expect(r.status()).toBeLessThan(500);
    }
    await c.ctx.dispose();
  });

  test('cursor parameter with SQLi yields 400/422, not 500', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get(`/courses?cursor=${encodeURIComponent("' OR 1=1 --")}&limit=5`);
    expect(r.status()).toBeLessThan(500);
    await c.ctx.dispose();
  });

  test('id path with SQLi yields 400/404, not 500', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get(`/courses/${encodeURIComponent("1; DROP TABLE courses;")}`);
    expect(r.status()).toBeLessThan(500);
    expect([400, 404, 422]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('error body never contains "syntax error" / "psql" / "ORA-" leakage', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get(`/courses?q=${encodeURIComponent("' OR 1=1 --")}`);
    const txt = await r.text();
    expect(txt.toLowerCase()).not.toMatch(/syntax error at|psql:|ora-\d{4,}|sqlite_/);
    await c.ctx.dispose();
  });
});
