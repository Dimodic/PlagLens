/**
 * E2E: retry & cancel actions for ExportJob.
 *
 * Most demo systems won't have a "failed" export by default, so we mainly
 * verify that the action endpoints are reachable and handle 404/409 gracefully.
 */
import { expect, test } from '../../setup/fixtures';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';

test.describe('Export retry/cancel', () => {
  test('retry on a non-existent export id returns 404 (not 500)', async () => {
    const c = await getApiClient('teacher');
    try {
      const r = await c.post(`/exports/nope-${Date.now()}:retry`);
      expect([400, 404, 422]).toContain(r.status());
    } finally {
      await c.dispose();
    }
  });

  test('cancel on a non-existent id returns 404 (not 500)', async () => {
    const c = await getApiClient('teacher');
    try {
      const r = await c.post(`/exports/nope-${Date.now()}:cancel`);
      expect([400, 404, 422]).toContain(r.status());
    } finally {
      await c.dispose();
    }
  });

  test('cancel queued export when present (best-effort)', async () => {
    const c = await getApiClient('teacher');
    try {
      const list = await c.get('/exports?status=queued');
      test.skip(!list.ok(), 'list failed');
      const j = await list.json();
      const item = (j?.data ?? [])[0];
      test.skip(!item, 'no queued exports to cancel');
      const r = await c.post(`/exports/${item.id}:cancel`);
      // 200/204 if cancelled, 409 if already terminal.
      expect([200, 204, 409, 422]).toContain(r.status());
    } finally {
      await c.dispose();
    }
  });
});
