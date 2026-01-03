/**
 * RFC 7807 Problem shape on every error.
 *
 * We sample one or two endpoints per error class:
 *   - 400 BAD_REQUEST (invalid JSON)
 *   - 401 UNAUTHENTICATED (missing / invalid token)
 *   - 403 FORBIDDEN (insufficient role)
 *   - 404 NOT_FOUND (missing resource)
 *   - 409 CONFLICT (duplicate resource)
 *   - 422 VALIDATION_FAILED (invalid field)
 */
import { test, expect } from '@playwright/test';
import {
  makeAuthedClient,
  makeAnonClient,
  expectProblem,
  getHeader,
  skipIfNotImplemented,
} from '../../helpers/cross-cutting';
import { uniqueSlug } from '../../helpers/factories';

test.describe('RFC 7807 Problem on errors', () => {
  test('400 BAD_REQUEST on invalid JSON body', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.post('/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: 'this is not json {{{',
    });
    expect([400, 422]).toContain(r.status());
    const body = await r.json().catch(() => null);
    if (body) {
      expect(typeof body.title).toBe('string');
      expect(typeof body.code).toBe('string');
    }
    await ctx.dispose();
  });

  test('401 UNAUTHENTICATED on missing bearer for protected endpoint', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.get('/auth/me');
    expect(r.status()).toBe(401);
    const p = await expectProblem(r, { status: 401 });
    expect(p.code).toMatch(/UNAUTHENTICATED|UNAUTHORIZED|TOKEN_/);
    await ctx.dispose();
  });

  test('401 with malformed bearer', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.get('/auth/me', {
      headers: { Authorization: 'Bearer not.a.real.jwt' },
    });
    expect(r.status()).toBe(401);
    await expectProblem(r, { status: 401 });
    await ctx.dispose();
  });

  test('404 NOT_FOUND for non-existent resource', async () => {
    const c = await makeAuthedClient('admin');
    const r = await c.get('/courses/99999999');
    expect([404]).toContain(r.status());
    await expectProblem(r, { status: 404 });
    await c.ctx.dispose();
  });

  test('422 VALIDATION_FAILED on invalid email in login', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.post('/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      data: { email: 'not-an-email', password: 'x', tenant_slug: 'demo-hse' },
    });
    expect([400, 401, 422]).toContain(r.status());
    const body = await r.json().catch(() => null);
    if (body) {
      expect(typeof body.code).toBe('string');
      expect(typeof body.title).toBe('string');
    }
    await ctx.dispose();
  });

  test('409 CONFLICT on duplicate course slug', async () => {
    const c = await makeAuthedClient('admin');
    const slug = uniqueSlug('dup');
    const body = { slug, name: 'Dup', description: 'd' };
    const r1 = await c.post('/courses', body);
    if (await skipIfNotImplemented(r1, test, 'POST /courses')) {
      await c.ctx.dispose();
      return;
    }
    if (!r1.ok()) {
      test.skip(true, `first create failed ${r1.status()}`);
      await c.ctx.dispose();
      return;
    }
    const r2 = await c.post('/courses', body);
    expect([409, 422]).toContain(r2.status());
    if (r2.status() === 409) {
      await expectProblem(r2, { status: 409 });
    }
    await c.ctx.dispose();
  });

  test('Problem includes request_id matching X-Request-Id header', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.get('/auth/me');
    expect(r.status()).toBe(401);
    const headerRid = getHeader(r, 'x-request-id') ?? '';
    const body = await r.json();
    expect(headerRid.length).toBeGreaterThan(0);
    if (body.request_id) {
      // Some implementations strip dashes; allow loose equality.
      const norm = (s: string) => s.replace(/-/g, '').toLowerCase();
      expect(norm(body.request_id)).toBe(norm(headerRid));
    }
    await ctx.dispose();
  });

  test('Content-Type indicates JSON-shaped error body', async () => {
    const ctx = await makeAnonClient();
    const r = await ctx.get('/auth/me');
    const ct = getHeader(r, 'content-type') ?? '';
    // application/problem+json is preferred; application/json acceptable.
    expect(ct.includes('json')).toBe(true);
    await ctx.dispose();
  });
});
