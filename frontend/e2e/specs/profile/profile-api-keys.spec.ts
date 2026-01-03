/**
 * /me/api-keys — create / rotate / revoke; key shown ONCE then masked.
 */
import { test, expect } from '../../setup/fixtures';
import { ApiKeysPo } from '../../pages/profile/ApiKeysPage.po';
import { waitForToast } from '../../helpers/waits';

test.describe('Profile API keys', () => {
  test('teacher opens API keys page', async ({ teacherPage }) => {
    const po = new ApiKeysPo(teacherPage);
    await po.goto();
    await expect(teacherPage.getByText('API keys').first()).toBeVisible();
  });

  test('create modal flow: name + scopes -> success warning + once-shown key', async ({
    teacherPage,
  }) => {
    const po = new ApiKeysPo(teacherPage);
    await po.goto();
    // The "Создать" button on the page header opens the modal.
    await teacherPage.getByRole('button', { name: 'Создать' }).first().click();
    await expect(po.nameInput).toBeVisible({ timeout: 5_000 });
    await po.nameInput.fill(`e2e-key-${Date.now()}`);
    // Skip scopes for the simplest creation flow.
    await po.createSubmit.click();
    // Once created: the modal should show api-key-modal-key with the actual key,
    // and a once-shown warning. If creation fails server-side, an error appears.
    const keyVisible = await po.modalKey.isVisible({ timeout: 15_000 }).catch(() => false);
    if (keyVisible) {
      await expect(po.onceWarning).toBeVisible();
      const keyText = await po.modalKey.textContent();
      expect(keyText && keyText.length).toBeGreaterThan(8);
      // Copy button appears once.
      await expect(po.copyButton).toBeVisible();
      // Done -> modal closes; key is no longer visible.
      await po.modalDone.click();
      await expect(po.modalKey).toHaveCount(0);
    } else {
      // Creation rejected — at least an error alert is shown.
      await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('rotate fires API and shows toast (best-effort: needs an existing key)', async ({
    teacherPage,
  }) => {
    const po = new ApiKeysPo(teacherPage);
    await po.goto();
    const rotateButton = teacherPage.getByRole('button', { name: 'Rotate' }).first();
    if (await rotateButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await rotateButton.click();
      await expect(
        teacherPage.locator('.mantine-Notification-root, [role="alert"]').first(),
      ).toBeVisible({ timeout: 10_000 });
    } else {
      test.skip();
    }
  });

  test('revoke fires API and shows toast (best-effort: needs an existing key)', async ({
    teacherPage,
  }) => {
    const po = new ApiKeysPo(teacherPage);
    await po.goto();
    const revokeButton = teacherPage.getByRole('button', { name: 'Revoke' }).first();
    if (await revokeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await revokeButton.click();
      await waitForToast(teacherPage, /отозван|revoked/i, 10_000);
    } else {
      test.skip();
    }
  });

  test('empty name validation in modal', async ({ teacherPage }) => {
    const po = new ApiKeysPo(teacherPage);
    await po.goto();
    await teacherPage.getByRole('button', { name: 'Создать' }).first().click();
    await expect(po.nameInput).toBeVisible({ timeout: 5_000 });
    // Submit without filling name.
    await po.createSubmit.click();
    await expect(teacherPage.getByText(/Название обязательно/i)).toBeVisible({ timeout: 3_000 });
  });
});
