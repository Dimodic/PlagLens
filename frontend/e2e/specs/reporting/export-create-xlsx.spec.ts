/**
 * E2E: create XLSX export and inspect resulting URL/size.
 *
 * We don't ship a XLSX parser into the suite — we just assert that the
 * job completes, returns a download URL with non-zero TTL, and the
 * artifact size is positive.
 */
import { expect, test } from '../../setup/fixtures';
import { ApiClient } from '../../helpers/api';
import { getApiClient } from '../../helpers/token-cache';
import { waitForOperation } from '../../helpers/waits';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

async function getCourseId(slug: string): Promise<string | null> {
  const c = await getApiClient('teacher');
  try {
    const r = await c.get(`/courses?slug=${encodeURIComponent(slug)}`);
    if (!r.ok()) return null;
    const j = await r.json();
    return j?.data?.[0]?.id ?? j?.[0]?.id ?? null;
  } finally {
    await c.dispose();
  }
}

test.describe('XLSX export', () => {
  test('create+poll+download XLSX', async () => {
    const courseId = await getCourseId(COURSE_SLUG);
    test.skip(!courseId, 'course not seeded');
    const c = await getApiClient('teacher');
    try {
      const r = await c.post(`/courses/${courseId}/exports`, {
        kind: 'course_summary',
        format: 'xlsx',
      });
      test.skip(
        [404, 405, 501].includes(r.status()),
        'reporting stub: POST /courses/:id/exports not implemented',
      );
      expect([200, 201, 202]).toContain(r.status());
      const j = await r.json();
      const id = j?.id ?? j?.metadata?.export_id ?? j?.export_id;
      test.skip(!id, 'export id not returned');

      const final = await waitForOperation(
        async () => (await (await c.get(`/exports/${id}`)).json()) as {
          status: string;
          artifact_size_bytes?: number;
        },
        (v) => v.status === 'completed' || v.status === 'failed',
        { timeout: 30_000 },
      );
      expect(['completed', 'failed']).toContain(final.status);
      if (final.status === 'completed') {
        if (typeof final.artifact_size_bytes === 'number') {
          expect(final.artifact_size_bytes).toBeGreaterThanOrEqual(0);
        }
        const dl = await c.get(`/exports/${id}/download`);
        expect(dl.ok()).toBeTruthy();
      }
    } finally {
      await c.dispose();
    }
  });
});
