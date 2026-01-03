# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: specs\reporting\export-retry-cancel.spec.ts >> Export retry/cancel >> retry on a non-existent export id returns 404 (not 500)
- Location: e2e\specs\reporting\export-retry-cancel.spec.ts:12:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 401
Received array: [400, 404, 422]
```

# Test source

```ts
  1  | /**
  2  |  * E2E: retry & cancel actions for ExportJob.
  3  |  *
  4  |  * Most demo systems won't have a "failed" export by default, so we mainly
  5  |  * verify that the action endpoints are reachable and handle 404/409 gracefully.
  6  |  */
  7  | import { expect, test } from '../../setup/fixtures';
  8  | import { ApiClient } from '../../helpers/api';
  9  | import { getApiClient } from '../../helpers/token-cache';
  10 | 
  11 | test.describe('Export retry/cancel', () => {
  12 |   test('retry on a non-existent export id returns 404 (not 500)', async () => {
  13 |     const c = await getApiClient('teacher');
  14 |     try {
  15 |       const r = await c.post(`/exports/nope-${Date.now()}:retry`);
> 16 |       expect([400, 404, 422]).toContain(r.status());
     |                               ^ Error: expect(received).toContain(expected) // indexOf
  17 |     } finally {
  18 |       await c.dispose();
  19 |     }
  20 |   });
  21 | 
  22 |   test('cancel on a non-existent id returns 404 (not 500)', async () => {
  23 |     const c = await getApiClient('teacher');
  24 |     try {
  25 |       const r = await c.post(`/exports/nope-${Date.now()}:cancel`);
  26 |       expect([400, 404, 422]).toContain(r.status());
  27 |     } finally {
  28 |       await c.dispose();
  29 |     }
  30 |   });
  31 | 
  32 |   test('cancel queued export when present (best-effort)', async () => {
  33 |     const c = await getApiClient('teacher');
  34 |     try {
  35 |       const list = await c.get('/exports?status=queued');
  36 |       test.skip(!list.ok(), 'list failed');
  37 |       const j = await list.json();
  38 |       const item = (j?.data ?? [])[0];
  39 |       test.skip(!item, 'no queued exports to cancel');
  40 |       const r = await c.post(`/exports/${item.id}:cancel`);
  41 |       // 200/204 if cancelled, 409 if already terminal.
  42 |       expect([200, 204, 409, 422]).toContain(r.status());
  43 |     } finally {
  44 |       await c.dispose();
  45 |     }
  46 |   });
  47 | });
  48 | 
```