/**
 * Student RBAC: read-only on most resources.
 *
 * Per docs/02-RBAC.md §4 matrix:
 *   - Cannot Create course / Update course / Delete course
 *   - Cannot create assignment
 *   - Cannot run plagiarism check / LLM analysis
 *   - Cannot delete submission
 */
import { test, expect } from '@playwright/test';
import { makeAuthedClient } from '../../helpers/cross-cutting';
import { uniqueSlug } from '../../helpers/factories';

test.describe('Student cannot write protected resources', () => {
  test('POST /courses → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.post('/courses', {
      slug: uniqueSlug('illegal'),
      name: 'Student-created',
      description: 'should be forbidden',
    });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('POST /tenants → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.post('/tenants', {
      slug: 'fake',
      name: 'Fake',
    });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('PATCH /courses/{id} → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.patch('/courses/1', { name: 'hacked' });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('DELETE /courses/{id} → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.del('/courses/1');
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('POST /assignments → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.post('/courses/1/assignments', {
      slug: uniqueSlug('a'),
      title: 'illegal',
      language: 'python',
    });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('POST /plagiarism-runs → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.post('/plagiarism-runs', { assignment_id: 1 });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('POST /ai-analyses → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.post('/ai-analyses', { submission_id: 1 });
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('GET /admin/audit/* → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.get('/audit/events');
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('GET /users (list) → 403', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.get('/users');
    expect([403, 404]).toContain(r.status());
    await c.ctx.dispose();
  });

  test('student CAN read /auth/me', async () => {
    const c = await makeAuthedClient('student1');
    const r = await c.get('/auth/me');
    expect(r.ok()).toBe(true);
    const me = await r.json();
    expect(me.global_role).toBe('student');
    await c.ctx.dispose();
  });
});
