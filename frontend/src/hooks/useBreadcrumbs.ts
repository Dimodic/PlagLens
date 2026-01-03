/**
 * useBreadcrumbs — derive a breadcrumb chain from the current location.
 *
 * Returns an ordered list of items (parent → current). Each item carries a
 * label and an optional `to` (clickable) flag plus a `current` marker for the
 * trailing crumb.
 *
 * Empty array → caller renders the existing single-line title fallback. This
 * keeps "shallow" screens (`/courses`, `/me`, `/admin/overview` …) free of
 * breadcrumb noise, since the sidebar already locates the user there.
 *
 * Rules-of-hooks: every hook below is invoked unconditionally on every call;
 * relevance is gated via React Query's `enabled` flag (course/homework/asg
 * resolvers no-op when the path doesn't need them). The breadcrumb chain
 * itself is then computed from the resolved data via a synchronous switch.
 */
import { useLocation, useParams } from 'react-router-dom';
import { useCourse } from '@/hooks/api/useCourses';
import { useAssignment } from '@/hooks/api/useAssignments';
import {
  useHomework,
  useHomeworksForCourse,
} from '@/hooks/api/useHomeworks';
import { useSubmission } from '@/hooks/api/useSubmissions';
import { usePlagiarismRun } from '@/hooks/api/usePlagiarism';
import { displayAuthor } from '@/api/endpoints/submissions';
import { useUser } from '@/hooks/api/useUsers';
import { useTranslation } from '@/i18n';

export interface BreadcrumbItem {
  /** Visible label (already translated). */
  label: string;
  /** When set, item renders as a `<Link to={…}>`. */
  to?: string;
  /** True for the trailing crumb (current page). */
  current?: boolean;
}

/** i18n key for each course sub-page slug (after `/courses/:slug/`). */
const COURSE_SUB_TITLE: Record<string, string> = {
  members: 'title.course-members',
  groups: 'title.course-groups',
  invitations: 'title.course-invitations',
  stats: 'title.course-stats',
  settings: 'title.course-settings',
  dashboard: 'title.course-dashboard',
  exports: 'title.course-exports',
  'scheduled-exports': 'title.course-scheduled-exports',
  'google-sheets': 'title.course-google-sheets',
  suspicious: 'title.course-suspicious',
};

/** Match a `/courses/<slug>/<sub>(/…)?` URL and return [slug, sub]. */
function matchCourseSub(path: string): [string, string] | null {
  const m = path.match(
    /^\/courses\/([^/]+)\/(members|groups|invitations|stats|settings|dashboard|exports|scheduled-exports|google-sheets|suspicious)(?:\/.*)?$/,
  );
  return m ? [m[1], m[2]] : null;
}

/** Match `/courses/<slug>/homeworks/<hwSlug>/assignments/new`. */
function matchHwAsgNew(path: string): boolean {
  return /^\/courses\/[^/]+\/homeworks\/[^/]+\/assignments\/new$/.test(path);
}

/** Match `/courses/<slug>/homeworks/new`. */
function matchHwNew(path: string): boolean {
  return /^\/courses\/[^/]+\/homeworks\/new$/.test(path);
}

/** Match plain `/courses/<slug>` (no trailing segment). */
function matchCourseDetail(path: string): boolean {
  return /^\/courses\/[^/]+$/.test(path) && path !== '/courses/new';
}

export function useBreadcrumbs(): BreadcrumbItem[] {
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams<Record<string, string>>();
  const path = location.pathname.replace(/\/+$/, '') || '/';

  // ---------------- Path classification ----------------
  // We classify the path once, then call all relevant data hooks (each gated
  // by `enabled`). This keeps hook ordering stable across renders.
  const courseSub = matchCourseSub(path);
  const isCourseDetail = matchCourseDetail(path);
  const isHwNew = matchHwNew(path);
  const isHwAsgNew = matchHwAsgNew(path);

  const isLegacyAssignment =
    /^\/assignments\/[^/]+$/.test(path) && !!params.id;
  // Sub-pages under /assignments/:id — settings, upload, submissions list.
  // We resolve the same way as the detail page (climb via assignment →
  // course/homework) and append the sub-page label at the end.
  const assignmentSubMatch =
    path.match(/^\/assignments\/([^/]+)\/(settings|upload|submissions|plagiarism|ai)$/) ?? null;
  const isMyAssignmentDetail =
    /^\/me\/assignments\/[^/]+$/.test(path) && !!params.id;
  const isMySubmissionDetail =
    /^\/me\/submissions\/[^/]+$/.test(path) && !!params.id;
  const isTeacherSubmission =
    /^\/submissions\/[^/]+$/.test(path) && !!params.id;
  const isPlagiarismRun =
    /^\/plagiarism-runs\/[^/]+$/.test(path) && !!params.runId;
  // /plagiarism-runs/:runId/pairs/:pairId — the side-by-side diff page.
  // Resolves through the same run → assignment chain as the run page
  // (``params.runId`` is right there in the URL), then appends a
  // terminal "Сравнение пары" crumb.
  const isPlagiarismPair =
    /^\/plagiarism-runs\/[^/]+\/pairs\/[^/]+$/.test(path) && !!params.runId;
  const isAdminUserDetail =
    /^\/admin\/users\/[^/]+$/.test(path) &&
    !!params.id &&
    params.id !== 'new';

  // Course slug used for resolution. URL params can come from any of the
  // matched routes — react-router gives us whichever is present.
  const courseSlugParam =
    params.slug ?? params.courseSlug ?? (courseSub ? courseSub[0] : undefined);

  const needCourseFromSlug =
    !!courseSlugParam &&
    (isCourseDetail || isHwNew || isHwAsgNew || !!courseSub);

  const needHomeworkLookupBySlug = isHwAsgNew;

  // Asg fetches: legacy /assignments/:id, /me/assignments/:id and the
  // /assignments/:id/{settings,upload,…} sub-pages all share useAssignment.
  // ``assignmentSubMatch?.[1]`` is the sub-page slug; the asg id sits in
  // params.id.
  const needLegacyAsg = isLegacyAssignment || !!assignmentSubMatch;
  const needMyAsg = isMyAssignmentDetail;

  // ---------------- Hook calls (every render, in order) ----------------

  // Course (by slug) — for course-* + homework-* routes.
  const courseBySlugQ = useCourse(needCourseFromSlug ? courseSlugParam : undefined);

  // Homeworks list for course (slug-based hw lookup) — for hw detail + hw asg new.
  const hwListQ = useHomeworksForCourse(
    needHomeworkLookupBySlug ? courseBySlugQ.data?.id : undefined,
    { limit: 100 },
  );

  // Legacy /assignments/:id — fetch the assignment, then its course + hw via id.
  const legacyAsgQ = useAssignment(needLegacyAsg ? params.id : undefined);
  const legacyCourseQ = useCourse(
    needLegacyAsg ? legacyAsgQ.data?.course_id : undefined,
  );
  const legacyHwQ = useHomework(
    needLegacyAsg ? legacyAsgQ.data?.homework_id ?? undefined : undefined,
  );

  // /me/assignments/:id — only need the assignment title.
  const myAsgQ = useAssignment(needMyAsg ? params.id : undefined);

  // /submissions/:id (teacher view) — climb via submission → assignment →
  // course/homework so the crumb reads "Курсы › <Course> › <Homework> ›
  // <Assignment> › <Автор>". The opaque `sub_…` id is never useful as a
  // nav label.
  const teacherSubQ = useSubmission(
    isTeacherSubmission ? params.id : undefined,
  );
  const teacherSubAsgQ = useAssignment(
    isTeacherSubmission ? teacherSubQ.data?.assignment_id : undefined,
  );
  const teacherSubCourseQ = useCourse(
    isTeacherSubmission ? teacherSubAsgQ.data?.course_id : undefined,
  );
  const teacherSubHwQ = useHomework(
    isTeacherSubmission
      ? teacherSubAsgQ.data?.homework_id ?? undefined
      : undefined,
  );

  // /plagiarism-runs/:runId(/pairs/:pairId) — climb via run → assignment
  // → course/hw so the crumb traces back to the assignment the teacher
  // came from ("Курсы › <Course> › <Homework> › <Assignment> › Плагиат")
  // instead of dead-ending at a standalone "Антиплагиат" section. Both
  // the run page and the pair-diff sub-page share this resolution.
  const needPlagChain = isPlagiarismRun || isPlagiarismPair;
  const plagRunQ = usePlagiarismRun(needPlagChain ? params.runId : undefined);
  const plagAsgQ = useAssignment(
    needPlagChain ? plagRunQ.data?.assignment_id ?? undefined : undefined,
  );
  const plagCourseQ = useCourse(
    needPlagChain ? plagAsgQ.data?.course_id : undefined,
  );
  const plagHwQ = useHomework(
    needPlagChain ? plagAsgQ.data?.homework_id ?? undefined : undefined,
  );

  // /admin/users/:id — for the user's display name.
  const userQ = useUser(isAdminUserDetail ? params.id : undefined);

  // ---------------- Build breadcrumbs ----------------

  // === STUDENT: /me/assignments/:id ===
  if (isMyAssignmentDetail) {
    return [
      { label: t('nav.my_assignments'), to: '/me/assignments' },
      {
        label: myAsgQ.data?.title ?? `Задание #${params.id}`,
        current: true,
      },
    ];
  }

  // === STUDENT: /me/submissions/:id ===
  if (isMySubmissionDetail) {
    return [
      { label: t('nav.my_submissions'), to: '/me/submissions' },
      { label: `Посылка #${params.id}`, current: true },
    ];
  }

  // === TEACHER: /courses/:slug/homeworks/:hwSlug/assignments/new ===
  if (isHwAsgNew && courseSlugParam && params.hwSlug) {
    const hw = hwListQ.data?.data.find((h) => h.slug === params.hwSlug);
    return [
      { label: t('nav.courses'), to: '/courses' },
      {
        label: courseBySlugQ.data?.name ?? courseSlugParam,
        to: `/courses/${courseSlugParam}`,
      },
      // HW detail page is gone; the homework crumb is now a label-only
      // pointer to the course (no separate destination for the HW).
      {
        label: hw?.title ?? params.hwSlug,
      },
      { label: t('title.homework-assignment-new'), current: true },
    ];
  }

  // === TEACHER: /courses/:slug/homeworks/new ===
  if (isHwNew && courseSlugParam) {
    return [
      { label: t('nav.courses'), to: '/courses' },
      {
        label: courseBySlugQ.data?.name ?? courseSlugParam,
        to: `/courses/${courseSlugParam}`,
      },
      { label: t('title.homework-new'), current: true },
    ];
  }

  // === TEACHER: /courses/:slug/{members,settings,…} ===
  if (courseSub) {
    const [slug, subPage] = courseSub;
    const subKey = COURSE_SUB_TITLE[subPage] ?? 'title.s_course';
    return [
      { label: t('nav.courses'), to: '/courses' },
      { label: courseBySlugQ.data?.name ?? slug, to: `/courses/${slug}` },
      { label: t(subKey), current: true },
    ];
  }

  // === TEACHER: /courses/:slug ===
  if (isCourseDetail && courseSlugParam) {
    return [
      { label: t('nav.courses'), to: '/courses' },
      {
        label: courseBySlugQ.data?.name ?? courseSlugParam,
        current: true,
      },
    ];
  }

  // === TEACHER: /assignments/:id (legacy flat) + /assignments/:id/<sub>
  // — climb via assignment.homework_id. The sub-page (settings/upload/…)
  // adds a trailing breadcrumb so the teacher still sees the full chain
  // back to the course.
  if (isLegacyAssignment || assignmentSubMatch) {
    const asg = legacyAsgQ.data;
    const course = legacyCourseQ.data;
    const hw = legacyHwQ.data;

    const subPage = assignmentSubMatch?.[2] ?? null;
    const SUB_LABEL: Record<string, string> = {
      settings: 'Настройки',
      upload: 'Загрузка',
      submissions: 'Посылки',
      plagiarism: 'Плагиат',
      ai: 'AI-анализ',
    };

    const items: BreadcrumbItem[] = [
      { label: t('nav.courses'), to: '/courses' },
    ];
    if (course) {
      items.push({ label: course.name, to: `/courses/${course.slug}` });
    }
    // Hide the homework crumb for the legacy "default" placeholder: backend
    // backfills missing homework_ids with a synthetic `default`-slug HW that
    // shouldn't surface in navigation.
    if (course && hw && hw.slug !== 'default') {
      items.push({
        label: hw.title,
        to: `/courses/${course.slug}/homeworks/${hw.slug}`,
      });
    }
    // Assignment itself — clickable when we're on a sub-page (so the user
    // can hop back to the detail view), terminal otherwise.
    items.push({
      label: asg?.title ?? `Задание #${params.id}`,
      to: subPage ? `/assignments/${params.id}` : undefined,
      current: !subPage,
    });
    if (subPage) {
      items.push({
        label: SUB_LABEL[subPage] ?? subPage,
        current: true,
      });
    }
    return items;
  }

  // === TEACHER: /submissions/:id ===
  // Full chain: Курсы › <Course> › <Homework> › <Assignment> › <Автор>.
  // Falls back gracefully while the queries are still loading.
  if (isTeacherSubmission) {
    const sub = teacherSubQ.data;
    const asg = teacherSubAsgQ.data;
    const course = teacherSubCourseQ.data;
    const hw = teacherSubHwQ.data;

    const items: BreadcrumbItem[] = [
      { label: t('nav.courses'), to: '/courses' },
    ];
    if (course) {
      items.push({ label: course.name, to: `/courses/${course.slug}` });
    }
    if (course && hw && hw.slug !== 'default') {
      items.push({
        label: hw.title,
        to: `/courses/${course.slug}/homeworks/${hw.slug}`,
      });
    }
    if (asg) {
      items.push({
        label: asg.title,
        to: `/assignments/${asg.id}`,
      });
    }
    items.push({
      // Author shown as the terminal crumb — same display rule used in
      // the submission row & header (`displayAuthor`).
      label: sub
        ? displayAuthor(sub)
        : `Посылка #${params.id}`,
      current: true,
    });
    return items;
  }

  // === Plagiarism: /plagiarism-runs/:runId (+ /pairs/:pairId) ===
  // Plagiarism is one check per assignment, so the run belongs in the
  // assignment's nav chain. We resolve run → assignment → course/hw and
  // build the same crumb shape as the assignment detail page, with a
  // terminal "Плагиат" crumb (matches the assignment tab name). On the
  // pair-diff sub-page "Плагиат" becomes clickable (back to the run)
  // and a final "Сравнение пары" crumb is appended. Falls back to a
  // minimal placeholder only while the run query is in flight.
  if (isPlagiarismRun || isPlagiarismPair) {
    const run = plagRunQ.data;
    const asg = plagAsgQ.data;
    const course = plagCourseQ.data;
    const hw = plagHwQ.data;

    if (!run || !asg) {
      // Still loading — keep a minimal, non-clickable placeholder so
      // the crumb bar doesn't flash a dead "Антиплагиат" link.
      return [
        { label: 'Плагиат', current: !isPlagiarismPair },
        ...(isPlagiarismPair
          ? [{ label: 'Сравнение пары', current: true }]
          : []),
      ];
    }

    const items: BreadcrumbItem[] = [
      { label: t('nav.courses'), to: '/courses' },
    ];
    if (course) {
      items.push({ label: course.name, to: `/courses/${course.slug}` });
    }
    if (course && hw && hw.slug !== 'default') {
      items.push({
        label: hw.title,
        to: `/courses/${course.slug}/homeworks/${hw.slug}`,
      });
    }
    items.push({
      label: asg.title,
      to: `/assignments/${asg.id}`,
    });
    items.push({
      label: 'Плагиат',
      // Clickable back to the run only when we're a level deeper.
      to: isPlagiarismPair ? `/plagiarism-runs/${params.runId}` : undefined,
      current: !isPlagiarismPair,
    });
    if (isPlagiarismPair) {
      items.push({ label: 'Сравнение пары', current: true });
    }
    return items;
  }

  // === Admin: /admin/users/:id ===
  if (isAdminUserDetail) {
    const u = userQ.data;
    const label =
      u?.display_name ??
      u?.email ??
      `#${params.id}`;
    return [
      { label: t('nav.users'), to: '/admin/users' },
      { label, current: true },
    ];
  }

  // === Integrations subtree ===
  if (path === '/integrations/yandex-contest/setup') {
    return [
      { label: 'Интеграции', to: '/integrations' },
      { label: 'Подключить Yandex.Contest', current: true },
    ];
  }
  if (path === '/integrations/stepik/setup') {
    return [
      { label: 'Интеграции', to: '/integrations' },
      { label: 'Подключить Stepik', current: true },
    ];
  }
  if (path === '/integrations/ejudge/setup') {
    return [
      { label: 'Интеграции', to: '/integrations' },
      { label: 'Подключить eJudge', current: true },
    ];
  }
  if (path === '/integrations/new' || path === '/admin/integrations/new') {
    return [
      { label: 'Интеграции', to: '/integrations' },
      { label: 'Новая интеграция', current: true },
    ];
  }
  if (/^\/integrations\/yandex-contest\/[^/]+\/contests$/.test(path)) {
    return [
      { label: 'Интеграции', to: '/integrations' },
      { label: 'Импорт из Yandex.Contest', current: true },
    ];
  }
  if (path === '/admin/integrations/oauth-providers') {
    return [
      { label: 'Интеграции', to: '/admin/integrations' },
      { label: 'OAuth-провайдеры', current: true },
    ];
  }
  if (path === '/integrations/oauth/callback') {
    return [
      { label: 'Интеграции', to: '/integrations' },
      { label: 'Подключение…', current: true },
    ];
  }

  // === Fallback — caller renders existing single-line title. ===
  return [];
}
