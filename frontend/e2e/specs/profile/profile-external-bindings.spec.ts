/**
 * /me/external-bindings — bind Stepik / Yandex.Contest user IDs.
 */
import { test, expect } from '../../setup/fixtures';
import { ExternalBindingsPo } from '../../pages/profile/ExternalBindingsPage.po';
import { uniqueSlug } from '../../helpers/factories';
import { waitForToast } from '../../helpers/waits';

test.describe('Profile — external bindings', () => {
  test('student opens bindings page', async ({ studentPage }) => {
    const po = new ExternalBindingsPo(studentPage);
    await po.goto();
    await expect(studentPage.getByText('Внешние привязки').first()).toBeVisible();
    await expect(po.system).toBeVisible({ timeout: 10_000 });
    await expect(po.externalId).toBeVisible();
    await expect(po.addSubmit).toBeVisible();
  });

  test('empty external_id shows local Problem alert', async ({ studentPage }) => {
    const po = new ExternalBindingsPo(studentPage);
    await po.goto();
    await po.externalId.fill('');
    await po.addSubmit.click();
    await expect(studentPage.getByText(/external_id обязател|REQUIRED/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test('add Stepik binding', async ({ studentPage }) => {
    const po = new ExternalBindingsPo(studentPage);
    await po.goto();
    // System is "Stepik" by default.
    await po.externalId.fill(uniqueSlug('stepik-id'));
    await po.displayName.fill('My Stepik account');
    await po.addSubmit.click();
    await expect(
      studentPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('switch to Yandex.Contest and add binding', async ({ studentPage }) => {
    const po = new ExternalBindingsPo(studentPage);
    await po.goto();
    await po.system.click();
    await studentPage.getByRole('option', { name: /Я.Контест/ }).click();
    await po.externalId.fill(uniqueSlug('yandex-id'));
    await po.addSubmit.click();
    await expect(
      studentPage.locator('.mantine-Notification-root, [role="alert"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('binding removal (best-effort: only if a row exists)', async ({ studentPage }) => {
    const po = new ExternalBindingsPo(studentPage);
    await po.goto();
    const remove = studentPage.locator('[data-testid^="binding-remove-"]').first();
    if (await remove.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await remove.click();
      await waitForToast(studentPage, /удален|removed/i, 10_000);
    } else {
      test.skip();
    }
  });
});
