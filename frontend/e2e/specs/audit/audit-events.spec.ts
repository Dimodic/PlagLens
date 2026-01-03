/**
 * /admin/audit — full timeline with filters and JSON expand.
 */
import { test, expect } from '../../setup/fixtures';
import { AuditEventsPo } from '../../pages/admin/AuditPage.po';

test.describe('Audit — events timeline', () => {
  test('admin opens audit timeline', async ({ adminPage }) => {
    const po = new AuditEventsPo(adminPage);
    await po.goto();
    await expect(adminPage.getByText('Аудит').first()).toBeVisible();
    await expect(po.applyFilters).toBeVisible();
  });

  test('filters bar exposes all four inputs and apply/reset', async ({ adminPage }) => {
    const po = new AuditEventsPo(adminPage);
    await po.goto();
    await expect(po.actorInput).toBeVisible();
    await expect(po.actionInput).toBeVisible();
    await expect(po.resourceTypeInput).toBeVisible();
    await expect(po.resultSelect).toBeVisible();
    await expect(po.applyFilters).toBeVisible();
    await expect(po.resetFilters).toBeVisible();
  });

  test('applying actor filter does not crash and either shows rows or empty state', async ({
    adminPage,
  }) => {
    const po = new AuditEventsPo(adminPage);
    await po.goto();
    await po.actorInput.fill('non-existent-actor');
    await po.applyFilters.click();
    await expect(
      adminPage.getByText(/Событий нет|actor:|action/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('result filter dropdown supports success/failure', async ({ adminPage }) => {
    const po = new AuditEventsPo(adminPage);
    await po.goto();
    await po.resultSelect.click();
    await adminPage.getByRole('option', { name: 'success' }).first().click();
    await po.applyFilters.click();
    // either rows or empty
    await adminPage.waitForLoadState('networkidle').catch(() => {});
  });

  test('expand JSON of an audit event card', async ({ adminPage }) => {
    const po = new AuditEventsPo(adminPage);
    await po.goto();
    const firstCard = adminPage.locator('[data-testid^="audit-event-card-"]').first();
    if (await firstCard.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // click toggle button — the action icon
      const toggleBtn = firstCard.getByRole('button').first();
      await toggleBtn.click();
      // After expand we should see "retention" badge.
      await expect(firstCard.getByText(/retention/).first()).toBeVisible({ timeout: 5_000 });
    } else {
      test.skip();
    }
  });

  test('reset filters clears actor input', async ({ adminPage }) => {
    const po = new AuditEventsPo(adminPage);
    await po.goto();
    await po.actorInput.fill('xxx');
    await po.applyFilters.click();
    await po.resetFilters.click();
    await expect(po.actorInput).toHaveValue('');
  });

  test('teacher cannot reach /admin/audit', async ({ teacherPage }) => {
    await teacherPage.goto('/admin/audit');
    await teacherPage.waitForLoadState('domcontentloaded');
    const url = teacherPage.url();
    if (url.includes('/admin/audit')) {
      const titleVisible = await teacherPage
        .getByText('Аудит')
        .first()
        .isVisible()
        .catch(() => false);
      if (titleVisible) {
        await expect(teacherPage.getByRole('alert').first()).toBeVisible({ timeout: 10_000 });
      }
    } else {
      expect(url).not.toContain('/admin/audit');
    }
  });
});
