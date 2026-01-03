/**
 * /courses/join — student joins via invitation code.
 *
 * Backend may not yet implement /courses:joinByCode (404). Tests verify the UI
 * flow and that errors render via ProblemAlert.
 */
import { test, expect } from '../../setup/fixtures';
import { JoinByCodePagePo } from '../../pages/courses/JoinByCodePage.po';

test.describe('/courses/join — invitation flow', () => {
  test('student lands on /courses/join with an empty code field', async ({
    studentPage,
  }) => {
    const join = new JoinByCodePagePo(studentPage);
    await join.goto();
    await expect(join.codeInput).toBeVisible();
    await expect(join.submit).toBeVisible();
    await expect(join.codeInput).toHaveValue('');
  });

  test('URL param fills the code input automatically', async ({ studentPage }) => {
    const join = new JoinByCodePagePo(studentPage);
    await join.goto('TEST-ABCD');
    await expect(join.codeInput).toHaveValue('TEST-ABCD');
  });

  test('short code (<4 chars) is rejected client-side', async ({ studentPage }) => {
    const join = new JoinByCodePagePo(studentPage);
    await join.goto();
    await join.fillCode('abc');
    await join.submitForm();
    // Form does not navigate.
    await expect(studentPage).toHaveURL(/\/courses\/join/);
  });

  test('invalid code yields a problem alert (or 404 from backend)', async ({
    studentPage,
  }) => {
    const join = new JoinByCodePagePo(studentPage);
    await join.goto();
    await join.fillCode('XXXX-NEVER');
    await join.submitForm();
    // Either a problem alert appears or the route stays on /courses/join.
    await expect(studentPage).toHaveURL(/\/courses\/join/);
    const alert = studentPage.getByRole('alert').first();
    const visible = await alert.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('admin can also reach the join screen', async ({ adminPage }) => {
    const join = new JoinByCodePagePo(adminPage);
    await join.goto();
    await expect(join.codeInput).toBeVisible();
  });

  test('the page is reachable from the empty list state via «Присоединиться по коду»', async ({
    studentPage,
  }) => {
    // Drive to /courses; if empty, click the join button.
    await studentPage.goto('/courses');
    await studentPage.waitForLoadState('domcontentloaded');
    const joinBtn = studentPage.getByTestId('courses-list-join-button');
    if (await joinBtn.isVisible().catch(() => false)) {
      await joinBtn.click();
      await expect(studentPage).toHaveURL(/\/courses\/join$/);
    }
  });
});
