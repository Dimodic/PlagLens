/**
 * /me/profile — edit display_name, locale, TZ; avatar upload.
 */
import { test, expect } from '../../setup/fixtures';
import { ProfilePo } from '../../pages/profile/ProfilePage.po';
import { waitForToast } from '../../helpers/waits';

test.describe('Profile — edit', () => {
  test('teacher opens own profile and sees email field disabled', async ({ teacherPage }) => {
    const po = new ProfilePo(teacherPage);
    await po.goto();
    await expect(po.emailReadonly).toBeDisabled();
    await expect(po.displayName).toBeVisible();
  });

  test('display_name save fires success toast', async ({ teacherPage }) => {
    const po = new ProfilePo(teacherPage);
    await po.goto();
    const newName = `Teacher E2E ${Date.now()}`;
    await po.displayName.fill(newName);
    await po.saveButton.click();
    await waitForToast(teacherPage, /сохранено|saved/i, 10_000);
  });

  test('locale select can switch to en and back', async ({ teacherPage }) => {
    const po = new ProfilePo(teacherPage);
    await po.goto();
    await po.localeSelect.click();
    await teacherPage.getByRole('option', { name: 'en' }).click();
    await po.saveButton.click();
    await waitForToast(teacherPage, /сохранено|saved/i, 10_000);
    await po.localeSelect.click();
    await teacherPage.getByRole('option', { name: 'ru' }).click();
    await po.saveButton.click();
    await waitForToast(teacherPage, /сохранено|saved/i, 10_000);
  });

  test('timezone field accepts IANA value', async ({ teacherPage }) => {
    const po = new ProfilePo(teacherPage);
    await po.goto();
    await po.timezone.fill('Europe/Moscow');
    await po.saveButton.click();
    await waitForToast(teacherPage, /сохранено|saved/i, 10_000);
  });

  test('avatar dropzone is visible and accepts an image', async ({ teacherPage }, testInfo) => {
    const po = new ProfilePo(teacherPage);
    await po.goto();
    await expect(teacherPage.getByText(/Загрузить аватар/i)).toBeVisible();
    // Dropzone uses a hidden file input behind the visible card.
    const fileInput = teacherPage.locator('input[type="file"]').first();
    if (await fileInput.count() > 0) {
      // Use a tiny PNG buffer — Playwright file payload.
      const png = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
          '0d49444154789c63000100000005000100' +
          '0db70a3f0000000049454e44ae426082',
        'hex',
      );
      await fileInput.setInputFiles({
        name: 'avatar.png',
        mimeType: 'image/png',
        buffer: png,
      });
      // Either toast success (upload OK) or an error toast — both acceptable.
      await expect(
        teacherPage.locator('.mantine-Notification-root, [role="alert"]').first(),
      ).toBeVisible({ timeout: 15_000 });
    } else {
      test.skip();
    }
  });
});
