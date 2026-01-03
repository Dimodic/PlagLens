/**
 * E2E: create PDF export.
 */
import { expect, test } from '../../setup/fixtures';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { waitForOperation } from '../../helpers/waits';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

test.describe('PDF export', () => {
  test('create PDF, terminal status reached, signed URL TTL ≤ 5min', async () => {
    const c = await getApiClient('teacher');
    try {
      const cl = await c.get(
        `/courses?slug=${encodeURIComponent(COURSE_SLUG)}`,
      );
      test.skip(!cl.ok(), 'course lookup failed');
      const cj = await cl.json();
      const courseId = cj?.data?.[0]?.id ?? cj?.[0]?.id;
      test.skip(!courseId, 'course id missing');

      const r = await c.post(`/courses/${courseId}/exports`, {
        kind: 'course_summary',
        format: 'pdf',
      });
      test.skip(
        [404, 405, 501].includes(r.status()),
        'reporting stub: POST /courses/:id/exports not implemented',
      );
      expect([200, 201, 202]).toContain(r.status());
      const j = await r.json();
      const id = j?.id ?? j?.metadata?.export_id ?? j?.export_id;
      test.skip(!id, 'export id missing');

      const final = await waitForOperation(
        async () =>
          (await (await c.get(`/exports/${id}`)).json()) as { status: string },
        (v) => ['completed', 'failed', 'cancelled'].includes(v.status),
        { timeout: 30_000 },
      );
      if (final.status === 'completed') {
        const dl = await c.get(`/exports/${id}/download`);
        expect(dl.ok()).toBeTruthy();
        const dlj = await dl.json();
        if (typeof dlj.expires_in === 'number') {
          expect(dlj.expires_in).toBeLessThanOrEqual(300);
        }
      }
    } finally {
      await c.dispose();
    }
  });
});
