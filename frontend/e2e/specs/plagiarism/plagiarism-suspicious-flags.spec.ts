/**
 * Plagiarism — suspicious submissions list per course.
 */
import { test, expect } from '../../setup/fixtures';
import { SuspiciousPage } from '../../pages/plagiarism/SuspiciousPage';
import { mockJson } from '../../helpers/plagAi';

const COURSE = 'algorithms-2026';

function flag(over: Partial<Record<string, unknown>> = {}) {
  return {
    flag_id: 'flg_001',
    submission_id: 'sub_001',
    author: { id: 'u_s3', display_name: 'Олег Кузнецов' },
    assignment_id: 'asg_demo',
    assignment_title: 'lab-1-sort',
    reason: 'High similarity with sub_002',
    severity: 'high',
    similarity: 0.92,
    paired_with: ['sub_002'],
    created_at: '2026-04-30T09:00:30Z',
    cleared_at: null,
    cleared_by: null,
    ...over,
  };
}

test.describe('Plagiarism / suspicious submissions', () => {
  test('lists active flags by default', async ({ teacherPage }) => {
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/courses/${COURSE}/suspicious-submissions`),
      {
        data: [flag(), flag({ flag_id: 'flg_002', severity: 'medium', similarity: 0.6 })],
        total: 2,
      },
    );

    const page = new SuspiciousPage(teacherPage);
    await page.open(COURSE);
    await expect(page.table).toBeVisible();
    await expect(page.row('flg_001')).toBeVisible();
    await expect(page.row('flg_002')).toBeVisible();
    await expect(page.rowSeverity('flg_001')).toContainText('high');
    await expect(page.rowSeverity('flg_002')).toContainText('medium');
  });

  test('empty state when no flags', async ({ teacherPage }) => {
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/courses/${COURSE}/suspicious-submissions`),
      { data: [], total: 0 },
    );
    const page = new SuspiciousPage(teacherPage);
    await page.open(COURSE);
    await expect(teacherPage.getByText(/Нет подозрительных/)).toBeVisible();
  });

  test('severity filter switches request payload', async ({ teacherPage }) => {
    let lastQuery = '';
    await teacherPage.route(
      new RegExp(`/api/v1/courses/${COURSE}/suspicious-submissions`),
      async (route) => {
        lastQuery = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], total: 0 }),
        });
      },
    );
    const page = new SuspiciousPage(teacherPage);
    await page.open(COURSE);
    await page.pickSeverity('high');
    await teacherPage.waitForTimeout(200);
    expect(lastQuery).toMatch(/severity=high/);
  });

  test('dismiss button calls dismiss endpoint and toast appears', async ({
    teacherPage,
  }) => {
    let dismissCalled = false;
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/courses/${COURSE}/suspicious-submissions`),
      { data: [flag()], total: 1 },
    );
    await teacherPage.route(
      /\/api\/v1\/submissions\/sub_001\/suspicious-flags\/flg_001:dismiss/,
      async (route) => {
        dismissCalled = true;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );
    const page = new SuspiciousPage(teacherPage);
    await page.open(COURSE);
    await page.rowDismissButton('flg_001').click();
    await expect(teacherPage.locator('.mantine-Notification-root, [role="alert"]'))
      .toContainText(/подозр|снят|обновл|ошиб/i, { timeout: 5_000 });
    expect(dismissCalled).toBe(true);
  });

  test('bump severity calls PATCH endpoint', async ({ teacherPage }) => {
    let patchCalled = false;
    await mockJson(
      teacherPage,
      new RegExp(`/api/v1/courses/${COURSE}/suspicious-submissions`),
      { data: [flag({ severity: 'low' })], total: 1 },
    );
    await teacherPage.route(
      /\/api\/v1\/submissions\/sub_001\/suspicious-flags\/flg_001/,
      async (route) => {
        if (route.request().method() === 'PATCH') {
          patchCalled = true;
          const body = route.request().postDataJSON();
          expect(body).toMatchObject({ severity: 'medium' });
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        });
      },
    );
    const page = new SuspiciousPage(teacherPage);
    await page.open(COURSE);
    await page.rowBumpButton('flg_001').click();
    await teacherPage.waitForTimeout(200);
    expect(patchCalled).toBe(true);
  });
});
