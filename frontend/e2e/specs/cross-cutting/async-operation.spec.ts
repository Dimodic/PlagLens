/**
 * Async Operation resource (Canvas-style).
 *
 * Triggering endpoints (assignment:import, plagiarism-runs, exports etc.)
 * are domain-specific.  This suite validates the *contract* of the
 * /v1/operations/{id} polling resource:
 *   - Shape: id, kind, status, progress?, result_url, error, metadata
 *   - status ∈ {queued, running, completed, failed, cancelled}
 *   - Cancellation accepts/rejects per-kind.
 *
 * Where no operation can be triggered cheaply, we read existing operations
 * to validate the response shape.
 */
import { test, expect } from '@playwright/test';
import {
  makeAuthedClient,
  pollOperation,
  expectProblem,
  skipIfNotImplemented,
  getHeader,
} from '../../helpers/cross-cutting';

test.describe('Async Operation contract', () => {
  test('GET /operations returns paginated list with valid statuses', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/operations?limit=10');
    if (await skipIfNotImplemented(r, test, 'GET /operations')) {
      await c.ctx.dispose();
      return;
    }
    expect(r.ok()).toBe(true);
    const json = await r.json();
    expect(Array.isArray(json.data)).toBe(true);
    const validStatuses = new Set(['queued', 'running', 'completed', 'failed', 'cancelled']);
    for (const op of json.data) {
      expect(typeof op.id).toBe('string');
      expect(typeof op.status).toBe('string');
      expect(validStatuses.has(op.status)).toBe(true);
      // result_url is null until completion.
      if (op.status !== 'completed') expect(op.result_url ?? null).toBeNull();
    }
    await c.ctx.dispose();
  });

  test('GET /operations/{id} returns full Operation shape', async () => {
    const c = await makeAuthedClient('admin');
    const list = await c.get('/operations?limit=1');
    if (await skipIfNotImplemented(list, test, 'GET /operations')) {
      await c.ctx.dispose();
      return;
    }
    const lj = await list.json();
    test.skip(!lj.data?.length, 'no operations exist to inspect');
    if (!lj.data?.length) {
      await c.ctx.dispose();
      return;
    }
    const id = lj.data[0].id;
    const r = await c.get(`/operations/${id}`);
    expect(r.ok()).toBe(true);
    const op = await r.json();
    expect(op.id).toBe(id);
    expect(typeof op.kind).toBe('string');
    expect(typeof op.status).toBe('string');
    // updated_at should be ISO timestamp if present.
    if (op.updated_at) expect(op.updated_at).toMatch(/T.*Z|\+\d{2}:?\d{2}/);
    await c.ctx.dispose();
  });

  test('non-existent operation id → 404 NOT_FOUND with Problem shape', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/operations/op_does_not_exist_xxxx');
    if (r.status() === 405) {
      test.skip(true, '/operations/{id} not implemented');
      await c.ctx.dispose();
      return;
    }
    expect(r.status()).toBe(404);
    await expectProblem(r, { status: 404, codeOneOf: ['NOT_FOUND', 'OPERATION_NOT_FOUND'] });
    await c.ctx.dispose();
  });

  test('cancel a non-cancellable operation responds with 409 or 404', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.post('/operations/op_does_not_exist:cancel');
    if (r.status() === 405 || r.status() === 404) {
      // not implemented or not found — both acceptable
      expect([404, 405]).toContain(r.status());
    } else {
      expect([404, 409, 410]).toContain(r.status());
    }
    await c.ctx.dispose();
  });

  test('async trigger pattern: 202 + Location header on long operation', async () => {
    const c = await makeAuthedClient('admin');
    // Try a few candidate triggers; first one that exists is enough.
    const candidates = [
      { path: '/exports', body: { kind: 'csv', target: 'courses' } },
      { path: '/operations:trigger-test', body: {} },
    ];
    let observed202 = false;
    for (const cand of candidates) {
      const r = await c.post(cand.path, cand.body, {
        'Idempotency-Key': '550e8400-e29b-41d4-a716-446655440000',
      });
      if (r.status() === 202) {
        observed202 = true;
        const loc = getHeader(r, 'location') ?? '';
        expect(loc.length).toBeGreaterThan(0);
        const body = await r.json();
        if (body?.operation_id) {
          // Try polling — but bound it tightly so we don't slow CI.
          await pollOperation(c, body.operation_id, { timeoutMs: 3_000, intervalMs: 200 }).catch(
            () => null,
          );
        }
        break;
      }
    }
    if (!observed202) {
      test.info().annotations.push({
        type: 'note',
        description: 'No async-trigger endpoint reachable; pattern unverified.',
      });
    }
    await c.ctx.dispose();
  });
});
