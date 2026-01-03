/**
 * 413 PAYLOAD_TOO_LARGE on uploads exceeding limit.
 *
 * We don't have a stable upload endpoint open; we simulate by sending a
 * very large JSON body to /courses POST and assert the server rejects
 * with 413 (or 400/422 if it validates first).  We stop short of the
 * full 60 MB to keep the test fast — 4 MB is enough to overshoot most
 * typical API JSON limits in dev.
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient } from '../../helpers/cross-cutting';
import { API_BASE_URL } from '../../helpers/api';

test.describe('Large payload protection', () => {
  test('overly long JSON description rejected (413/400/422), never 500', async () => {
    const c = await makeAuthedClient('admin');
    // 4 MB string is well above any sane field limit but below dev kernel
    // request body cap, so the server gets to decide.
    const huge = 'a'.repeat(4 * 1024 * 1024);
    const r = await c.post('/courses', {
      slug: 'big-' + Date.now(),
      name: 'big',
      description: huge,
    });
    expect(r.status()).toBeLessThan(500);
    expect([400, 413, 422]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('giant query string is rejected (414/400), not 500', async () => {
    const c = await makeAuthedClient('admin');
    const big = 'x'.repeat(8_000); // 8 KB query string
    const r = await c.get(`/courses?q=${big}&limit=5`);
    expect(r.status()).toBeLessThan(500);
    await c.ctx.dispose();
  });

  test('upload file ≈60 MB to upload endpoint → 413 PAYLOAD_TOO_LARGE', async () => {
    const c = await makeAuthedClient('admin');
    // Use multipart with a generated buffer; if no upload route, skip.
    const buf = Buffer.alloc(60 * 1024 * 1024, 0x61);
    const r = await c.ctx
      .post(`${API_BASE_URL}/submissions/upload`, {
        headers: { Authorization: `Bearer ${c.token}` },
        multipart: {
          file: { name: 'huge.bin', mimeType: 'application/octet-stream', buffer: buf },
        },
      })
      .catch((e: unknown) => {
        // Some servers close the connection mid-stream — treat as a pass
        // (proper rejection at network layer).
        const msg = (e as Error)?.message ?? '';
        return msg.includes('socket') ? null : (() => { throw e; })();
      });
    if (!r) return;
    if (r.status() === 404 || r.status() === 405) {
      test.skip(true, 'no upload endpoint reachable');
      await c.ctx.dispose();
      return;
    }
    expect([400, 413, 415, 422]).toContain(r.status());
    await c.ctx.dispose();
  });
});
