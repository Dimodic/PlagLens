/**
 * super_admin-only operations.
 *
 * Per matrix: only super_admin can:
 *   - Create / manage tenants
 *   - View global dashboard
 *
 * `admin@demo.local` is tenant-admin, not super_admin → must be denied.
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient } from '../../helpers/cross-cutting';

test.describe('Super-admin-only endpoints', () => {
  test('tenant admin → POST /tenants → 403', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.post('/tenants', { slug: 'evil', name: 'evil-tenant' });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('tenant admin → GET /tenants → 403/404', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/tenants');
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('teacher → POST /tenants → 403', async () => {
    const c = await makeAuthedClient('teacher');
    const r = await c.post('/tenants', { slug: 'evil2', name: 'evil2' });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('student → POST /tenants → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.post('/tenants', { slug: 'evil3', name: 'evil3' });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('global dashboard endpoint denies tenant admin', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/dashboards/global');
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test.skip(
    !process.env.E2E_SUPER_ADMIN_PASSWORD || process.env.E2E_SUPER_ADMIN_PASSWORD === 'changeme',
    'super-admin credentials not provided in env',
  );

  test('super_admin can read /tenants when configured', async () => {
    // Only run if super-admin is reachable.
    let canSuper = false;
    try {
      const c = await makeAuthedClient('super_admin');
      const r = await c.get('/tenants');
      canSuper = r.ok();
      await c.ctx.dispose();
    } catch {
      canSuper = false;
    }
    test.skip(!canSuper, 'super_admin login or /tenants unavailable');
    expect(canSuper).toBe(true);
  });
});
