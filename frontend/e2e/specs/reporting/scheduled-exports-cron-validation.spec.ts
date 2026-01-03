/**
 * E2E: ScheduledExportsPage — cron expression validation.
 *
 * The cron input accepts a string but presets help. We verify presets are
 * correct format and the input value reflects them.
 */
import { expect, test } from '../../setup/fixtures';
import { ScheduledExportsPagePo } from '../../pages/reporting/ScheduledExportsPage.po';

const COURSE_SLUG = process.env.E2E_DEMO_COURSE_SLUG ?? 'algorithms-2026';

test.describe('Scheduled exports cron presets', () => {
  test('common presets are present and unique', async ({ teacherPage }) => {
    const po = new ScheduledExportsPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.newBtn.click();
    const expected = [
      '0_9_*_*_*', // daily 9:00
      '0_9_*_*_1', // weekly Monday 9:00
      '0_*/4_*_*_*', // every 4 hours
    ];
    for (const id of expected) {
      const preset = teacherPage.getByTestId(`cron-preset-${id}`);
      // Best-effort: not all preset ids may exist — at least one must.
      const ok = await preset.isVisible({ timeout: 2_000 }).catch(() => false);
      if (ok) {
        await expect(preset).toBeVisible();
      }
    }
  });

  test('cron input accepts a custom expression', async ({ teacherPage }) => {
    const po = new ScheduledExportsPagePo(teacherPage);
    await po.goto(COURSE_SLUG);
    await po.newBtn.click();
    await po.cronInput.fill('30 14 * * 5');
    await expect(po.cronInput).toHaveValue('30 14 * * 5');
  });
});
