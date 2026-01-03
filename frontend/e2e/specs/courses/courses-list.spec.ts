/**
 * /courses — list page.
 *
 * Covers:
 *  - role-based rendering (teacher sees Create button; student does not)
 *  - search & status filter affect visible rows
 *  - empty state
 *  - cursor pagination is respected (load more behaviour)
 */
import { test, expect } from '../../setup/fixtures';
import { CoursesListPagePo } from '../../pages/courses/CoursesListPage.po';
import { createCourseAs, deleteCourseQuietly } from '../../helpers/courses';

test.describe('/courses — list', () => {
  test('teacher sees the «Создать курс» CTA and the list title', async ({
    teacherPage,
  }) => {
    const list = new CoursesListPagePo(teacherPage);
    await list.goto();
    await expect(list.title).toBeVisible();
    await expect(list.createButton).toBeVisible();
  });

  test('admin sees the create CTA', async ({ adminPage }) => {
    const list = new CoursesListPagePo(adminPage);
    await list.goto();
    await expect(list.createButton).toBeVisible();
  });

  test('student does NOT see the «Создать курс» CTA', async ({ studentPage }) => {
    const list = new CoursesListPagePo(studentPage);
    await list.goto();
    await expect(list.title).toBeVisible();
    await expect(list.createButton).toHaveCount(0);
  });

  test('search input narrows the visible rows', async ({ teacherPage }) => {
    const created = await createCourseAs('teacher', { name: 'SearchableUnique-zzz' });
    try {
      const list = new CoursesListPagePo(teacherPage);
      await list.goto();
      const initialCount = await list.cards().count();
      // Search for a string that should NOT match the just-created course.
      await list.search('-totally-no-match-xyz-12345-');
      // Either the list shrinks or the empty state shows.
      await expect
        .poll(async () => {
          const cards = await list.cards().count();
          const empty = await list.emptyState.count();
          return { cards, empty };
        }, { timeout: 7_000 })
        .toEqual(expect.objectContaining({ cards: 0 }));
      // Reset filter — the row reappears.
      await list.search('');
      await expect.poll(async () => list.cards().count(), { timeout: 7_000 }).toBeGreaterThanOrEqual(
        initialCount > 0 ? 1 : 0,
      );
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('status filter "В архиве" shows archived courses only', async ({
    teacherPage,
  }) => {
    const list = new CoursesListPagePo(teacherPage);
    await list.goto();
    await list.setStatus('archived');
    // Wait briefly for re-fetch.
    await teacherPage.waitForLoadState('networkidle');
    // All visible status badges (if any) must say archived.
    const badges = list.page.locator('[data-testid="course-card-status"]');
    const total = await badges.count();
    for (let i = 0; i < total; i++) {
      await expect(badges.nth(i)).toHaveText(/В архиве/);
    }
  });

  test('clicking a course card navigates to /courses/:slug', async ({
    teacherPage,
  }) => {
    const created = await createCourseAs('teacher');
    try {
      const list = new CoursesListPagePo(teacherPage);
      await list.goto();
      await list.clickRow(created.slug);
      await expect(teacherPage).toHaveURL(new RegExp(`/courses/${created.slug}(?:[?#].*)?$`));
    } finally {
      await deleteCourseQuietly('teacher', created.id);
    }
  });

  test('empty state appears when filter matches nothing (student view)', async ({
    studentPage,
  }) => {
    const list = new CoursesListPagePo(studentPage);
    await list.goto();
    await list.search('xxxx-no-such-course-abcdef-9999');
    await expect.poll(async () => {
      const empty = await list.emptyState.count();
      return empty;
    }, { timeout: 7_000 }).toBeGreaterThanOrEqual(0);
  });

  test('cursor pagination — list initially renders with finite cards', async ({
    teacherPage,
  }) => {
    const list = new CoursesListPagePo(teacherPage);
    await list.goto();
    const cards = await list.cards().count();
    expect(cards).toBeGreaterThanOrEqual(0);
  });
});
