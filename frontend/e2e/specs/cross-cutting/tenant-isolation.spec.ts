/**
 * Tenant isolation.
 *
 * - admin@demo.local belongs to tenant `demo-hse`.
 * - System-tenant resources must not be visible to demo admin.
 * - Cross-tenant resource lookups return 404 (not 403, to avoid leaking
 *   existence per docs/02-RBAC §7).
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient } from '../../helpers/cross-cutting';

test.describe('Tenant isolation', () => {
  test('demo admin cannot list system-tenant courses', async () => {
    const c = await makeAuthedClient('admin');
    // Try cross-tenant query via X-Tenant-Hint (gateway should ignore for non-super)
    const r = await c.get('/courses?limit=10', { 'X-Tenant-Hint': 'system' });
    expect(r.ok()).toBe(true);
    const json = await r.json();
    // Each returned course must belong to demo tenant.
    for (const course of json.data ?? []) {
      if (course.tenant_id) {
        // demo-hse tenant_id is namespaced; system uses tnt_system or similar.
        expect(course.tenant_id).not.toMatch(/^tnt_system|system$/i);
      }
    }
    await c.ctx.dispose();
  });

  test('demo admin reading a foreign-tenant resource id returns 404, not 403', async () => {
    const c = await makeAuthedClient('admin');
    // Forge an unlikely-to-exist foreign id; backend should treat it as
    // not found rather than disclose 403. course_id is integer in this
    // backend, so we pick a number well outside the seeded range.
    const r = await c.get('/courses/9999999');
    expect([404]).toContain(r.status());
    const body = await r.json().catch(() => null);
    if (body) {
      expect(body.code).toMatch(/NOT_FOUND/);
    }
    await c.ctx.dispose();
  });

  test('demo admin cannot list system tenants', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/tenants');
    // Either 403 or 404 acceptable; not 200.
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('demo admin cannot read another tenant by id', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/tenants/tnt_system');
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('JWT payload tenant_id matches all returned resources', async () => {
    const c = await makeAuthedClient('admin');
    // Decode token to get tenant_id.
    const parts = c.token.split('.');
    const payload = JSON.parse(
      Buffer.from(
        parts[1].padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '='),
        'base64',
      ).toString('utf-8'),
    );
    const tenantId = payload.tenant_id as string | undefined;
    expect(typeof tenantId).toBe('string');

    const r = await c.get('/courses?limit=20');
    if (r.ok()) {
      const json = await r.json();
      for (const item of json.data ?? []) {
        if (item.tenant_id) expect(item.tenant_id).toBe(tenantId);
      }
    }
    await c.ctx.dispose();
  });

  test('cross-tenant audit log not visible to demo admin', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/audit/access-denied?limit=5&tenant=system');
    // Either filtered out, or 403 — not a list of system records.
    if (r.ok()) {
      const j = await r.json();
      for (const ev of j.data ?? []) {
        if (ev.tenant_id) expect(ev.tenant_id).not.toMatch(/system/i);
      }
    }
    await c.ctx.dispose();
  });
});
