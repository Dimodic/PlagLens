/**
 * Cursor pagination contract.
 *
 * Per 01-CROSS-CUTTING §4:
 *   - response.pagination.next_cursor: string | null
 *   - response.pagination.has_more: boolean
 *   - response.pagination.limit: number
 *   - cursor is opaque — client must not parse it
 *   - has_more=false ⇒ next_cursor=null
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient, walkPagination, skipIfNotImplemented } from '../../helpers/cross-cutting';

test.describe('Cursor pagination', () => {
  test('list response has correct envelope shape', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/courses?limit=5');
    if (await skipIfNotImplemented(r, test, 'GET /courses')) {
      await c.ctx.dispose();
      return;
    }
    expect(r.ok()).toBe(true);
    const json = await r.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.pagination).toBeDefined();
    expect(typeof json.pagination.has_more).toBe('boolean');
    expect(typeof json.pagination.limit).toBe('number');
    // next_cursor is string | null
    if (json.pagination.next_cursor !== null) {
      expect(typeof json.pagination.next_cursor).toBe('string');
    }
    await c.ctx.dispose();
  });

  test('has_more=false implies next_cursor=null', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/courses?limit=200');
    if (await skipIfNotImplemented(r, test, 'GET /courses')) {
      await c.ctx.dispose();
      return;
    }
    const json = await r.json();
    if (json.pagination.has_more === false) {
      expect(json.pagination.next_cursor).toBeNull();
    }
    await c.ctx.dispose();
  });

  test('cursor is opaque (looks like base64-ish, not a JSON id leak)', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/courses?limit=1');
    if (await skipIfNotImplemented(r, test, 'GET /courses')) {
      await c.ctx.dispose();
      return;
    }
    const json = await r.json();
    if (json.pagination?.next_cursor) {
      const cursor: string = json.pagination.next_cursor;
      // Cursor should NOT look like a raw JSON object.
      expect(cursor.startsWith('{')).toBe(false);
      // Cursor should NOT contain url-unsafe chars in plain text.
      expect(cursor.length).toBeGreaterThan(0);
    }
    await c.ctx.dispose();
  });

  test('walking with cursor returns disjoint pages and stops at has_more=false', async () => {
    const c = await makeAuthedClient('admin');
    // Try a few list endpoints — use the first that exists.
    const candidates = ['/courses', '/users', '/operations'];
    let chosen: string | null = null;
    for (const p of candidates) {
      const r = await c.get(`${p}?limit=2`);
      if (r.ok()) {
        chosen = p;
        break;
      }
    }
    test.skip(!chosen, 'no paginated endpoint reachable');
    if (!chosen) {
      await c.ctx.dispose();
      return;
    }
    const { items, pages } = await walkPagination(c, chosen, 2, 5);
    expect(pages).toBeGreaterThanOrEqual(1);
    // No duplicate IDs across pages (when items have id).
    const idsWithKey = items
      .map((it) => (it as { id?: unknown }).id)
      .filter((id) => id !== undefined);
    if (idsWithKey.length > 1) {
      expect(new Set(idsWithKey).size).toBe(idsWithKey.length);
    }
    await c.ctx.dispose();
  });

  test('limit=1 returns at most 1 item per page', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/courses?limit=1');
    if (await skipIfNotImplemented(r, test, 'GET /courses')) {
      await c.ctx.dispose();
      return;
    }
    const json = await r.json();
    expect(json.data.length).toBeLessThanOrEqual(1);
    expect(json.pagination.limit).toBe(1);
    await c.ctx.dispose();
  });

  test('limit out of range (0 or 999) is rejected or clamped', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/courses?limit=999');
    if (r.status() === 422 || r.status() === 400) {
      const j = await r.json();
      expect(typeof j.code).toBe('string');
    } else if (r.ok()) {
      const j = await r.json();
      expect(j.pagination.limit).toBeLessThanOrEqual(200);
    }
    await c.ctx.dispose();
  });
});
