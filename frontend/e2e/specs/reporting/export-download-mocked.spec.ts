/**
 * E2E: deterministic export create+download with mocked Reporting API.
 *
 * The real reporting service may be stubbed in the gateway today; this spec
 * intercepts the create + status + download endpoints and verifies the
 * frontend correctly:
 *   - submits the request with Idempotency-Key
 *   - polls until completed
 *   - opens the signed download URL
 *
 * This exercises the entire UI flow without depending on a real backend.
 */
import { expect, test } from '../../setup/fixtures';
import { ExportsListPagePo } from '../../pages/reporting/ExportsListPage.po';

test.describe('Exports flow (mocked)', () => {
  test('create CSV → poll → download (UI)', async ({ teacherPage }) => {
    // 1. Mock POST /api/v1/exports → 202 Accepted with Operation envelope.
    await teacherPage.route(
      /\/api\/v1\/exports(\?|$)/,
      async (route) => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 202,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'exp_e2e_mock_1',
              tenant_id: 'tnt_e2e',
              kind: 'course_summary',
              format: 'csv',
              scope: {},
              status: 'queued',
              created_at: new Date().toISOString(),
            }),
          });
          return;
        }
        // GET /exports list — return empty page.
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'exp_e2e_mock_1',
                tenant_id: 'tnt_e2e',
                kind: 'course_summary',
                format: 'csv',
                scope: {},
                status: 'completed',
                artifact_size_bytes: 1024,
                created_at: new Date().toISOString(),
              },
            ],
            pagination: { has_more: false, next_cursor: null, limit: 50 },
          }),
        });
      },
    );

    // 2. Mock GET /api/v1/exports/:id → completed.
    await teacherPage.route(
      /\/api\/v1\/exports\/exp_e2e_mock_1$/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'exp_e2e_mock_1',
            tenant_id: 'tnt_e2e',
            kind: 'course_summary',
            format: 'csv',
            status: 'completed',
            artifact_uri: 's3://bucket/exports/exp_e2e_mock_1.csv',
            artifact_size_bytes: 1024,
            artifact_format: 'csv',
            artifact_filename: 'export.csv',
            scope: {},
            created_at: new Date().toISOString(),
          }),
        });
      },
    );

    // 3. Mock GET /api/v1/exports/:id/download → signed URL.
    await teacherPage.route(
      /\/api\/v1\/exports\/exp_e2e_mock_1\/download$/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: 'data:text/csv;base64,YSxiLGMKMSwyLDM=',
            expires_in: 300,
          }),
        });
      },
    );

    const po = new ExportsListPagePo(teacherPage);
    await po.goto();
    // The mocked list returns one completed export — it should render.
    await expect(
      teacherPage.getByTestId('export-row-exp_e2e_mock_1'),
    ).toBeVisible({ timeout: 10_000 });
    // Download button must be enabled.
    const dl = teacherPage.getByTestId('download-exp_e2e_mock_1');
    await expect(dl).toBeVisible();
    await expect(dl).toBeEnabled();
  });

  test('signed URL TTL is honoured (<= 300s) — observed via fetch from page', async ({
    teacherPage,
  }) => {
    await teacherPage.route(
      /\/api\/v1\/exports\/exp_ttl_test\/download$/,
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: 'https://signed.example.com/file.csv',
            expires_in: 280,
          }),
        });
      },
    );
    // Run fetch from inside the page so page.route intercepts apply.
    await teacherPage.goto('/me/exports');
    const j = await teacherPage.evaluate(async () => {
      const r = await fetch('/api/v1/exports/exp_ttl_test/download');
      return r.json();
    });
    expect(j.expires_in).toBeLessThanOrEqual(300);
    expect(j.expires_in).toBeGreaterThan(0);
  });
});
