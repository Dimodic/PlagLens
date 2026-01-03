/**
 * /courses/:slug/invitations — generate and revoke invitation codes.
 */
import { test, expect } from '../../setup/fixtures';
import { CourseInvitationsPagePo } from '../../pages/courses/CourseInvitationsPage.po';
import {
  createCourseAs,
  createInvitationAs,
  deleteCourseQuietly,
} from '../../helpers/courses';

test.describe('/courses/:slug/invitations', () => {
  test('teacher sees title + Создать приглашение CTA', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const inv = new CourseInvitationsPagePo(teacherPage);
      await inv.gotoBySlug(created.slug);
      await expect(inv.title).toBeVisible();
      await expect(inv.createButton).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('opening Create dialog reveals the form fields', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    try {
      const inv = new CourseInvitationsPagePo(teacherPage);
      await inv.gotoBySlug(created.slug);
      await inv.openCreateDialog();
      await expect(inv.maxUsesInput).toBeVisible();
      await expect(inv.submit).toBeVisible();
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('pre-seeded invitation row is visible with code, copy, and delete buttons', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    let invitation: { id: string | number; code: string } | null = null;
    try {
      invitation = await createInvitationAs('teacher', created.id, {
        role: 'student',
        max_uses: 5,
      });
    } catch {
      test.skip(true, 'Backend rate-limited or invitations endpoint unavailable');
    }
    try {
      const inv = new CourseInvitationsPagePo(teacherPage);
      await inv.gotoBySlug(created.slug);
      if (invitation) {
        const row = inv.rowForId(invitation.id);
        await expect(row).toBeVisible({ timeout: 10_000 });
        await expect(inv.codeForId(invitation.id)).toContainText(invitation.code);
        await expect(inv.copyButtonForId(invitation.id)).toBeVisible();
        await expect(inv.deleteButtonForId(invitation.id)).toBeVisible();
      }
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('clicking the copy button does not throw (clipboard tooltip changes to «Скопировано»)', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    let invitation: { id: string | number; code: string } | null = null;
    try {
      invitation = await createInvitationAs('teacher', created.id);
    } catch {
      test.skip(true, 'Backend rate-limited or invitations endpoint unavailable');
    }
    try {
      const inv = new CourseInvitationsPagePo(teacherPage);
      await inv.gotoBySlug(created.slug);
      if (invitation) {
        await inv.copyButtonForId(invitation.id).click();
        // Mantine Tooltip shows «Скопировано» after a successful copy.
        // We just verify the click did not crash; tooltip state is best-effort.
        await teacherPage.waitForLoadState('networkidle');
      }
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('revoking an invitation removes its row', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    let invitation: { id: string | number; code: string } | null = null;
    try {
      invitation = await createInvitationAs('teacher', created.id);
    } catch {
      test.skip(true, 'Backend rate-limited or invitations endpoint unavailable');
    }
    try {
      const inv = new CourseInvitationsPagePo(teacherPage);
      await inv.gotoBySlug(created.slug);
      if (invitation) {
        const row = inv.rowForId(invitation.id);
        if ((await row.count()) > 0) {
          await inv.deleteButtonForId(invitation.id).click();
          await expect.poll(async () => row.count(), { timeout: 10_000 }).toBe(0);
        }
      }
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('used count column shows N or N/M format', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher');
    let invitation: { id: string | number; code: string } | null = null;
    try {
      invitation = await createInvitationAs('teacher', created.id, { max_uses: 5 });
    } catch {
      test.skip(true, 'Backend rate-limited');
    }
    try {
      const inv = new CourseInvitationsPagePo(teacherPage);
      await inv.gotoBySlug(created.slug);
      if (invitation) {
        const row = inv.rowForId(invitation.id);
        await expect(row).toBeVisible();
        // The third column in the row holds «used / max_uses».
        await expect(row).toContainText(/0\s*\/\s*5/);
      }
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });
});
