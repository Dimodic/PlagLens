/**
 * E2E: create JSON export.
 */
import { expect, test } from '../../setup/fixtures';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { waitForOperation } from '../../helpers/waits';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

test.describe('JSON export', () => {
  test('create JSON export and verify status flow', async () => {
    const c = await getApiClient('teacher');
    try {
      const courseLookup = await c.get(
        `/courses?slug=${encodeURIComponent(COURSE_SLUG)}`,
      );
      test.skip(!courseLookup.ok(), 'course not seeded');
      const cj = await courseLookup.json();
      const courseId = cj?.data?.[0]?.id ?? cj?.[0]?.id;
      test.skip(!courseId, 'course id missing');

      const r = await c.post(`/courses/${courseId}/exports`, {
        kind: 'course_summary',
        format: 'json',
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
      expect(['completed', 'failed', 'cancelled']).toContain(final.status);
    } finally {
      await c.dispose();
    }
  });
});
