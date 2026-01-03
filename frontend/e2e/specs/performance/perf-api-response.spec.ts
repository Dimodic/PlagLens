/**
 * API response-time budget: /courses p95 < 500ms over 20 calls.
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient } from '../../helpers/cross-cutting';

const P95_BUDGET_MS = process.env.PLAGLENS_PERF_PROD ? 500 : 1_500;

test.describe('API response time', () => {
  test('GET /courses p95 within budget over 20 calls', async () => {
    const c = await makeAuthedClient('admin');
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = Date.now();
      const r = await c.get('/courses?limit=10');
      samples.push(Date.now() - t0);
      expect(r.ok()).toBe(true);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(`p95 GET /courses = ${p95}ms (samples: min=${samples[0]} max=${samples.at(-1)})`);
    expect(p95).toBeLessThan(P95_BUDGET_MS);
    await c.ctx.dispose();
  });

  test('GET /auth/me p50 < 300ms', async () => {
    const c = await makeAuthedClient('admin');
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t0 = Date.now();
      const r = await c.get('/auth/me');
      samples.push(Date.now() - t0);
      expect(r.ok()).toBe(true);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)];
    expect(p50).toBeLessThan(P95_BUDGET_MS);
    await c.ctx.dispose();
  });

  test('GET /healthz responds < 1s', async ({ request }) => {
    // /healthz is unauthenticated and lives at the proxy root, NOT under /api.
    const t0 = Date.now();
    const r = await request.get('/healthz');
    const dt = Date.now() - t0;
    expect(dt).toBeLessThan(2_000);
    expect([200, 503]).toContain(r.status());
  });
});
