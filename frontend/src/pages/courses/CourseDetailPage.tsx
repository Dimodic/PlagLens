/**
 * /courses/:slug — course detail.
 *
 * Layout: header band → description → tabs → homeworks list (default tab).
 * Tabs (homeworks / members / groups / invitations / stats / dashboard /
 * exports / schedules / sheets / suspicious) are link-style: clicking
 * navigates to the matching nested route. Existing data-testids on every
 * tab and row are preserved so Playwright specs continue to pass.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  Outlet,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
} from 'lucide-react';
import {
  useArchiveCourse,
  useCourse,
  useDeleteCourse,
  useDuplicateCourse,
  useUnarchiveCourse,
  useUpdateCourse,
} from '@/hooks/api/useCourses';
import { cn } from '@/components/ui/utils';
import { HomeworkDrawer } from '@/components/courses/HomeworkDrawer';
import { MembersPanel } from '@/components/courses/MembersPanel';
// StatsPanel pulls in recharts (~70 KB gzipped). It only renders when the
// user opens the "Статистика" tab — defer it through React.lazy so the
// main course page (homeworks list, members, etc.) renders without paying
// the recharts parse cost up-front.
const StatsPanel = lazy(() =>
  import('@/components/courses/StatsPanel').then((m) => ({ default: m.StatsPanel })),
);
import { SuspiciousPanel } from '@/components/courses/SuspiciousPanel';
import { useAssignmentsByCourse } from '@/hooks/api/useAssignments';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { ImportHomeworkDialog } from '@/components/courses/ImportHomeworkDialog';
import {
  statusForAssignment,
  taskLinkTarget,
  type MySub,
} from '@/lib/studentTaskStatus';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { useTranslation, type TParams } from '@/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Page } from '@/components/layout/Page';
import { PageSkeleton, SkeletonList } from '@/components/common/Skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExpandableSearch } from '@/components/common/ExpandableSearch';
import { formatDate, formatDateTime } from '@/utils/formatters';
import { HomeworkCreateDialog } from '@/components/courses/HomeworkCreateDialog';

// Archive-only lifecycle: draft + active/published collapse into one state.
function statusBadge(status: string, t: (key: string, params?: TParams) => string) {
  if (status === 'archived')
    return <StatusPill tone="neutral">{t('course_detail.status_archived')}</StatusPill>;
  return <StatusPill tone="success">{t('course_detail.status_active')}</StatusPill>;
}

type CourseTab = 'homeworks' | 'members' | 'stats' | 'suspicious';

const COURSE_TABS: readonly CourseTab[] = [
  'homeworks',
  'members',
  'stats',
  'suspicious',
];

function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export default function CourseDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { user } = useAuth();

  const { data: course, isLoading, error } = useCourse(slug);
  const archive = useArchiveCourse(course?.id ?? '');
  const unarchive = useUnarchiveCourse(course?.id ?? '');
  const duplicate = useDuplicateCourse(course?.id ?? '');
  const deleteCourse = useDeleteCourse(course?.id ?? '');

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // Inline edit of the course's own fields (name / dates / description),
  // edited IN PLACE on this page — the heading/description themselves
  // become editable, no separate form card or «Настройки» route.
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({
    name: '',
    description: '',
    start: '',
    end: '',
  });
  const updateCourse = useUpdateCourse(course?.id ?? '');
  const onSaveCourse = async () => {
    if (!course) return;
    if (!edit.name.trim()) {
      notify.error(t('course_detail.name_required'));
      return;
    }
    try {
      await updateCourse.mutateAsync({
        name: edit.name.trim(),
        description: edit.description,
        start_date: edit.start || null,
        end_date: edit.end || null,
      });
      notify.success(t('course_detail.saved'));
      setEditing(false);
    } catch (e) {
      notify.error(parseProblem(e).detail || t('course_detail.save_failed'));
    }
  };
  const startEditing = () => {
    if (!course) return;
    setEdit({
      name: course.name,
      description: course.description ?? '',
      start: toDateInput(course.start_date),
      end: toDateInput(course.end_date),
    });
    setEditing(true);
  };
  // Tab state lives in the URL (``?tab=members``) so the browser back
  // button works, deep-links remember which tab you were on, and old
  // sub-route bookmarks can redirect cleanly.
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const requestedTab: CourseTab = (COURSE_TABS as readonly string[]).includes(
    rawTab ?? '',
  )
    ? (rawTab as CourseTab)
    : 'homeworks';
  const setTab = (next: CourseTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'homeworks') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params);
  };
  // Students can't view the staff tabs even via direct URL — they
  // either don't render the contents (RBAC server-side) or surface a
  // half-broken empty view. Pin the tab to «homeworks» for them.

  // ----- Inline-expand homework rows -----
  //
  // Clicking a homework header expands its assignments list IN PLACE
  // (no navigation to /homeworks/:slug). Per the design call: multiple
  // open at a time + state persists across navigation away/back via
  // sessionStorage, keyed by course id so each course has its own
  // "what was open last time".
  const [expandedHws, setExpandedHws] = useState<Set<string>>(
    () => new Set(),
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !course?.id) return;
    try {
      const raw = sessionStorage.getItem(
        `plaglens:course:${course.id}:expanded-hw`,
      );
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setExpandedHws(new Set(parsed.map(String)));
      }
    } catch {
      // Corrupt entry — leave default (all collapsed) and move on.
    }
  }, [course?.id]);
  useEffect(() => {
    if (typeof window === 'undefined' || !course?.id) return;
    try {
      sessionStorage.setItem(
        `plaglens:course:${course.id}:expanded-hw`,
        JSON.stringify(Array.from(expandedHws)),
      );
    } catch {
      // Storage full / disabled — silent; state still lives in memory.
    }
  }, [expandedHws, course?.id]);
  const toggleHw = (hwId: string) => {
    setExpandedHws((prev) => {
      const next = new Set(prev);
      if (next.has(hwId)) next.delete(hwId);
      else next.add(hwId);
      return next;
    });
  };
  // Settings drawer state — only one homework at a time, since the
  // drawer is a singleton overlay.
  const [drawerHwId, setDrawerHwId] = useState<string | null>(null);

  // In-page task/ДЗ search: filters the homeworks list to matches, force-
  // expands them, highlights the matching task and scrolls to the first.
  const [taskQuery, setTaskQuery] = useState('');
  const tq = taskQuery.trim().toLowerCase();
  const firstMatchRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (!tq) return;
    const id = setTimeout(
      () => firstMatchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      120,
    );
    return () => clearTimeout(id);
  }, [tq]);

  useDocumentTitle(course?.name);

  const isOwner = useMemo(() => {
    if (!course || !user) return false;
    if (hasCourseRole(user, course.id, ['owner', 'co_owner'])) return true;
    if (hasGlobalRole(user, ['admin'])) return true;
    if (
      (course as { owner_id?: string }).owner_id != null &&
      (course as { owner_id?: string }).owner_id === user.id
    ) {
      return true;
    }
    return hasGlobalRole(user, ['teacher']);
  }, [course, user]);

  // Staff = anyone who can see the management surfaces (Members, Stats,
  // Suspicious tabs, etc.). Pure students only get the ДЗ list — no role
  // chrome, no rosters, no plagiarism dashboard. They submit, see their
  // grade and comment, that's it.
  const isStaff = useMemo(() => {
    if (!user) return false;
    if (hasGlobalRole(user, ['admin', 'teacher', 'assistant'])) return true;
    if (
      course &&
      hasCourseRole(user, course.id, ['owner', 'co_owner', 'assistant'])
    ) {
      return true;
    }
    return false;
  }, [course, user]);

  // Resolve the actual tab the body renders: staff get what the URL
  // asks for, students are pinned to «homeworks» regardless of
  // ``?tab=…`` shenanigans.
  const tab: CourseTab = isStaff ? requestedTab : 'homeworks';

  const homeworksQ = useHomeworksForCourse(course?.id, { limit: 100 });
  // YC imports easily push the assignment count past 100; keep the cap high
  // enough so the per-homework counters below ("N заданий") count every
  // assignment, otherwise the freshly-imported homework reads as empty.
  const assignmentsQ = useAssignmentsByCourse(course?.id, {
    limit: 500,
    sort: '-deadline_soft_at',
  });

  // Student-only: pull *my* submissions for this course so we can route
  // each task row to the same target the dashboard does — straight into
  // the latest readable submission if there is one, falling back to the
  // assignment page when there isn't. Staff don't need this (they go to
  // the grading inbox), so the query is gated on !isStaff.
  const mySubsQ = useMySubmissions(
    !isStaff && course?.id ? { course_id: course.id, limit: 500 } : {},
  );
  const mySubsByAsgId = useMemo(() => {
    const m = new Map<string, MySub[]>();
    if (isStaff) return m;
    const raw = mySubsQ.data as unknown;
    const list: MySub[] = Array.isArray(raw)
      ? (raw as MySub[])
      : ((raw as { data?: MySub[] })?.data ?? []);
    for (const s of list) {
      const key = String(s.assignment_id);
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [isStaff, mySubsQ.data]);

  // Import-as-homework: one «Импортировать» menu item opens a single dialog
  // (ImportHomeworkDialog) that handles every external source —
  // Yandex.Contest / Stepik / eJudge — behind a source switcher. Manual
  // creation stays a separate menu item.
  const [importOpen, setImportOpen] = useState(false);
  const [createHwOpen, setCreateHwOpen] = useState(false);
  // Homework deletion lives inside HomeworkDrawer (its own ConfirmDialog
  // + mutation). The row used to host an inline delete icon, but two
  // icons stacked on the row looked cluttered — settings/drawer is the
  // only per-row action now, and it has Delete + Archive in its footer.

  const assignments = assignmentsQ.data?.data ?? [];

  // First task matching the in-page search (document order) — its row gets
  // the scroll ref so we can bring it into view. MUST stay above the loading
  // guards below: a useMemo after an early return changes the hook count
  // between the loading and loaded renders → React error #310 (crash on a
  // cold, uncached open of the course page).
  const firstMatchAsgId = useMemo(() => {
    if (!tq) return null;
    for (const hw of homeworksQ.data?.data ?? []) {
      const hwId = String(hw.id);
      const m = assignments
        .filter((a) => a.homework_id != null && String(a.homework_id) === hwId)
        .sort((a, b) => Number(a.id) - Number(b.id))
        .find((a) => (a.title ?? '').toLowerCase().includes(tq));
      if (m) return String(m.id);
    }
    return null;
  }, [tq, homeworksQ.data, assignments]);

  // Header / tabs / actions all branch on the loaded course — keep an early
  // return, but show a skeleton instead of "Загрузка курса…" text. After the
  // first request the entry is cached for staleTime, so subsequent visits
  // skip this branch entirely and feel instant.
  if (isLoading && !course) {
    return <PageSkeleton width="regular" />;
  }
  if (error || !course) {
    return <ProblemAlert problem={parseProblem(error)} />;
  }

  const handleArchive = async () => {
    setConfirmArchive(false);
    try {
      await archive.mutateAsync();
      notify.success(t('course_detail.archived'));
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteCourse.mutateAsync();
      notify.success(t('course_detail.deleted'));
      navigate('/courses');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleDuplicate = async () => {
    try {
      const clone = await duplicate.mutateAsync();
      notify.success(t('course_detail.duplicated'));
      // Synchronous clone — go straight to it instead of polling a
      // (non-existent) async operation.
      navigate(`/courses/${clone.slug}`);
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleUnarchive = async () => {
    try {
      await unarchive.mutateAsync();
      notify.success(t('course_detail.unarchived'));
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  // Tab switching is pure URL state now — no navigate() to sub-routes.
  // Old sub-routes (members/stats/groups/…) redirect to ``?tab=…`` so
  // existing bookmarks land back inside the course page.
  const handleTabChange = (value: string) => {
    if ((COURSE_TABS as readonly string[]).includes(value)) {
      setTab(value as CourseTab);
    }
  };

  return (
    <Page width="regular">
      {/* Same minimalism pass as HomeworkDetail: drop the slug eyebrow,
          drop the "Активен" pill (archive-only lifecycle), drop the
          horizontal rule under the heading. Keep only what helps the
          teacher orient: title, dates / member count, and the archived
          pill when it actually applies. */}
      <div
        data-testid="course-detail-header"
        className="flex items-start gap-6"
      >
        <div className="flex-1 min-w-0">
          {course.semester && (
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {course.semester}
            </div>
          )}
          {editing ? (
            // Heading turns editable in place — same size/weight, just an
            // underline so it's clearly a field.
            <input
              data-testid="course-edit-name"
              value={edit.name}
              onChange={(e) =>
                setEdit((v) => ({ ...v, name: e.target.value }))
              }
              placeholder={t('course_detail.name_placeholder')}
              size={Math.max(12, edit.name.length + 2)}
              className={`max-w-full rounded-md border border-dashed border-muted-foreground/40 bg-transparent px-2 py-1 text-2xl font-semibold tracking-tight outline-none focus:border-solid focus:border-primary ${course.semester ? 'mt-2' : ''}`}
            />
          ) : (
            <h1
              data-testid="course-detail-title"
              className={`text-2xl font-semibold tracking-tight ${course.semester ? 'mt-2' : ''}`}
            >
              {course.name}
            </h1>
          )}
          {editing ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <input
                type="date"
                data-testid="course-edit-start"
                value={edit.start}
                onChange={(e) =>
                  setEdit((v) => ({ ...v, start: e.target.value }))
                }
                className="rounded-md border border-dashed border-muted-foreground/40 bg-transparent px-2 py-0.5 outline-none focus:border-solid focus:border-primary"
              />
              <span>–</span>
              <input
                type="date"
                data-testid="course-edit-end"
                value={edit.end}
                onChange={(e) =>
                  setEdit((v) => ({ ...v, end: e.target.value }))
                }
                className="rounded-md border border-dashed border-muted-foreground/40 bg-transparent px-2 py-0.5 outline-none focus:border-solid focus:border-primary"
              />
            </div>
          ) : (
            (course.status === 'archived' ||
              course.start_date ||
              typeof course.members_count === 'number') && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {course.status === 'archived' && (
                  <span data-testid="course-detail-status">
                    {statusBadge(course.status, t)}
                  </span>
                )}
                {course.start_date && (
                  <span>
                    {formatDate(course.start_date)} –{' '}
                    {formatDate(course.end_date ?? null)}
                  </span>
                )}
                {typeof course.members_count === 'number' && (
                  <span>
                    {t('course_detail.members_count', {
                      count: course.members_count,
                    })}
                  </span>
                )}
              </div>
            )
          )}
        </div>
        {isOwner && editing ? (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={updateCourse.isPending}
              data-testid="course-edit-cancel"
            >
              {t('course_detail.cancel')}
            </Button>
            <Button
              onClick={onSaveCourse}
              disabled={updateCourse.isPending}
              data-testid="course-edit-save"
            >
              {updateCourse.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('course_detail.save')}
            </Button>
          </div>
        ) : isOwner ? (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={startEditing}
              title={t('course_detail.edit')}
              aria-label={t('course_detail.edit')}
              data-testid="course-detail-settings-button"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('course_detail.more')}
                  data-testid="course-detail-menu-trigger"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                data-testid="course-detail-menu"
              >
                <DropdownMenuItem
                  onSelect={() => void handleDuplicate()}
                  data-testid="course-detail-duplicate"
                >
                  {t('course_detail.duplicate_structure')}
                </DropdownMenuItem>
                {course.status !== 'archived' ? (
                  <DropdownMenuItem
                    onSelect={() => setConfirmArchive(true)}
                    className="text-amber-600 focus:text-amber-600"
                    data-testid="course-detail-archive"
                  >
                    {t('course_detail.archive')}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => void handleUnarchive()}
                    className="text-emerald-600 focus:text-emerald-600"
                    data-testid="course-detail-unarchive"
                  >
                    {t('course_detail.unarchive')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => setConfirmDelete(true)}
                  className="text-destructive focus:text-destructive"
                  data-testid="course-detail-delete"
                >
                  {t('course_detail.delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </div>

      {editing ? (
        // Description edits in place — a borderless textarea styled like
        // the prose it replaces.
        <textarea
          data-testid="course-edit-description"
          rows={2}
          value={edit.description}
          onChange={(e) =>
            setEdit((v) => ({ ...v, description: e.target.value }))
          }
          placeholder={t('course_detail.description_placeholder')}
          className="w-full max-w-2xl resize-none rounded-md border border-dashed border-muted-foreground/40 bg-transparent px-2 py-1.5 text-sm leading-relaxed text-muted-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/50 focus:border-solid focus:border-primary"
        />
      ) : (
        course.description && (
          <p
            data-testid="course-detail-description"
            className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground"
          >
            {course.description}
          </p>
        )
      )}

      {problem && <ProblemAlert problem={problem} />}

      {/* Tabs — staff sees four (ДЗ / Участники / Статистика / Подозрительные).
          Students see no tabs at all: their view is just the homeworks
          list — they submit, see their grade and comment, leave. The
          rosters + plagiarism dashboard would be confusing and partly
          forbidden by RBAC anyway. */}
      {isStaff && (
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="homeworks">
              <span data-testid="course-detail-tab-homeworks">
                {t('course_detail.tab_homeworks')}
              </span>
              {(homeworksQ.data?.data ?? []).length > 0 && (
                <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                  {(homeworksQ.data?.data ?? []).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="members">
              <span data-testid="course-detail-tab-members">
                {t('course_detail.tab_members')}
              </span>
            </TabsTrigger>
            <TabsTrigger value="stats">
              <span data-testid="course-detail-tab-stats">
                {t('course_detail.tab_stats')}
              </span>
            </TabsTrigger>
            <TabsTrigger value="suspicious">
              <span data-testid="course-detail-tab-suspicious">
                {t('course_detail.tab_suspicious')}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {/* Homeworks list (default tab content) */}
      {tab === 'homeworks' && (
        <div className="space-y-4">
          {(isOwner || (homeworksQ.data?.data ?? []).length > 0) && (
            <div className="flex items-center justify-end gap-2">
              {(homeworksQ.data?.data ?? []).length > 0 && (
                <ExpandableSearch
                  value={taskQuery}
                  onChange={setTaskQuery}
                  placeholder={t('course_detail.task_search_placeholder')}
                  data-testid="course-detail-task-search"
                />
              )}
              {isOwner && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button data-testid="course-detail-create-homework">
                      <Plus className="mr-2 h-4 w-4" />
                      {t('course_detail.new_homework')}
                      <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setCreateHwOpen(true)}
                      data-testid="course-detail-create-homework-manual"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('course_detail.create_manual')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setImportOpen(true)}
                      data-testid="course-detail-create-homework-import"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {t('course_detail.create_import')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          )}
          {homeworksQ.isLoading && !homeworksQ.data ? (
            <SkeletonList rows={3} rowHeight={48} />
          ) : (homeworksQ.data?.data ?? []).length === 0 ? (
            <div
              className="py-16 text-center text-sm text-muted-foreground"
              data-testid="course-detail-homeworks-empty"
            >
              {t('course_detail.homeworks_empty')}
            </div>
          ) : (
            <div
              className="flex flex-col"
              data-testid="course-detail-homeworks-list"
            >
              <div className="contents">
                {(homeworksQ.data?.data ?? []).map((hw) => {
                  const hwId = String(hw.id);
                  // Filter+sort the assignments that belong to THIS hw —
                  // the parent already loaded all course assignments
                  // (limit 500) so no extra fetch. Sequential int ids; sort
                  // ascending reproduces import order (A→Z YC, oldest-first).
                  const hwAssignments = assignments
                    .filter(
                      (a) =>
                        a.homework_id != null &&
                        String(a.homework_id) === hwId,
                    )
                    .sort((a, b) => Number(a.id) - Number(b.id));
                  // «Простое ДЗ» — само ДЗ и есть задание. Driven by the
                  // backend ``kind`` flag (NOT a title-match heuristic). We
                  // still require the one task to be present so the row has
                  // something to open. Renders as a single leaf row — no
                  // expand, no nested self-duplicate, no «1 заданий».
                  const isSimple =
                    hw.kind === 'single' && hwAssignments.length === 1;
                  const meta = [
                    hw.due_at
                      ? t('course_detail.hw_deadline', {
                          date: formatDateTime(hw.due_at),
                        })
                      : null,
                    isSimple
                      ? null
                      : t('course_detail.hw_assignments_count', {
                          count: hwAssignments.length,
                        }),
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  // In-page search: hide non-matching ДЗ, force-open the
                  // matches, and (below) highlight the matching task.
                  const hwTitleMatch =
                    !!tq && (hw.title ?? '').toLowerCase().includes(tq);
                  const matchingAsgIds = tq
                    ? new Set(
                        hwAssignments
                          .filter((a) =>
                            (a.title ?? '').toLowerCase().includes(tq),
                          )
                          .map((a) => String(a.id)),
                      )
                    : new Set<string>();
                  if (tq && !hwTitleMatch && matchingAsgIds.size === 0)
                    return null;
                  // Simple ДЗ never expands — it's a single openable row.
                  const isOpen =
                    !isSimple &&
                    (expandedHws.has(hwId) || matchingAsgIds.size > 0);
                  // Where the simple-ДЗ row leads: straight to its one task
                  // (staff → assignment detail; student → latest readable
                  // submission, same rule as the nested rows below).
                  const simpleAsg = isSimple ? hwAssignments[0] : null;
                  const simpleTarget = simpleAsg
                    ? isStaff
                      ? `/assignments/${simpleAsg.id}`
                      : taskLinkTarget(
                          simpleAsg.id,
                          statusForAssignment(
                            mySubsByAsgId.get(String(simpleAsg.id)) ?? [],
                          ),
                        )
                    : null;
                  return (
                    <div
                      key={hw.id}
                      data-testid={`course-hw-row-${hw.id}`}
                      className="flex flex-col"
                    >
                      <div className="group flex items-center gap-2 rounded-md px-1 py-3 transition-colors hover:bg-muted/30">
                        {isSimple && simpleTarget ? (
                          <Link
                            to={simpleTarget}
                            data-testid={`course-hw-toggle-${hw.id}`}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            {/* No chevron — a simple ДЗ is a leaf (opens its
                                one task), so an expand arrow would mislead.
                                Keep a spacer so the title still lines up with
                                the expandable ДЗ above/below. */}
                            <span className="h-4 w-4 flex-none" aria-hidden />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {hw.title}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {meta}
                              </div>
                            </div>
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => toggleHw(hwId)}
                            aria-expanded={isOpen}
                            data-testid={`course-hw-toggle-${hw.id}`}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 flex-none text-muted-foreground transition-transform duration-150',
                                isOpen && 'rotate-90',
                              )}
                            />
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground truncate">
                                {hw.title}
                              </div>
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                {meta}
                              </div>
                            </div>
                          </button>
                        )}
                        {hw.status === 'archived' && (
                          <span className="text-xs text-muted-foreground/70">
                            {t('course_detail.archived_badge')}
                          </span>
                        )}
                        {/* Single per-row action: open the drawer. Delete +
                            Archive live inside the drawer footer to avoid
                            stacking icons on the row (looked cluttered).
                            Staff-only — for a student the drawer is just
                            a roster + grade-config they can't change, so
                            the gear icon was pure noise on /me's twin. */}
                        {isStaff && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrawerHwId(hwId);
                            }}
                            aria-label={t('course_detail.hw_settings')}
                            data-testid={`course-hw-settings-${hw.id}`}
                            className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded opacity-60 group-hover:opacity-100 transition-opacity"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {isOpen && (
                        <div
                          className="pl-6 pb-2"
                          data-testid={`course-hw-expanded-${hw.id}`}
                        >
                          {hwAssignments.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                              {t('course_detail.hw_no_assignments')}
                            </p>
                          ) : (
                            <ul className="flex flex-col">
                              {hwAssignments.map((a) => {
                                // Students go straight to their latest
                                // readable submission when one exists, so
                                // the click behaves the same as on the
                                // /me dashboard. Staff still land on the
                                // assignment detail (their grading inbox
                                // entry point).
                                const mySubs = isStaff
                                  ? []
                                  : (mySubsByAsgId.get(String(a.id)) ?? []);
                                const status = statusForAssignment(mySubs);
                                const target = isStaff
                                  ? `/assignments/${a.id}`
                                  : taskLinkTarget(a.id, status);
                                const isMatch = matchingAsgIds.has(String(a.id));
                                return (
                                  <li
                                    key={a.id}
                                    ref={
                                      String(a.id) === firstMatchAsgId
                                        ? firstMatchRef
                                        : undefined
                                    }
                                  >
                                    <Link
                                      to={target}
                                      data-testid={`course-hw-assignment-${a.id}`}
                                      className={cn(
                                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/30',
                                        isMatch &&
                                          'bg-primary/10 ring-1 ring-primary/30',
                                      )}
                                    >
                                      <span className="min-w-0 flex-1 truncate text-foreground">
                                        {a.title}
                                      </span>
                                      {/* language_hint dropped — language is
                                          shown next to the actual code on the
                                          submission detail; in the assignment
                                          list it's repeat noise. */}
                                      {a.status === 'archived' && (
                                        <span className="text-xs text-muted-foreground/70">
                                          {t('course_detail.archived_badge')}
                                        </span>
                                      )}
                                      <ChevronRight className="h-3 w-3 flex-none text-muted-foreground" />
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* "Все задания курса" accordion removed — every assignment
              now belongs to a homework, so the flat list always
              duplicated what's already visible above. */}
        </div>
      )}

      {tab === 'members' && course && (
        <MembersPanel courseId={course.id} canManage={isOwner} />
      )}

      {tab === 'stats' && course && (
        <Suspense fallback={<SkeletonList rows={3} />}>
          <StatsPanel courseId={course.id} courseSlug={course.slug} />
        </Suspense>
      )}

      {tab === 'suspicious' && course && (
        <SuspiciousPanel courseId={course.slug ?? course.id} />
      )}

      <Outlet />

      {/* Homework drawer — view + edit. ``homework`` is looked up from
          the already-loaded list; assignments are pre-filtered so the
          drawer doesn't double-fetch them. */}
      {(() => {
        const items = homeworksQ.data?.data ?? [];
        const drawerHw =
          items.find((h) => String(h.id) === drawerHwId) ?? null;
        const drawerAssignments = drawerHw
          ? assignments.filter(
              (a) =>
                a.homework_id != null &&
                String(a.homework_id) === String(drawerHw.id),
            )
          : [];
        return (
          <HomeworkDrawer
            open={drawerHwId !== null}
            onClose={() => setDrawerHwId(null)}
            homework={drawerHw}
            assignments={drawerAssignments}
            canManage={isOwner}
          />
        );
      })()}

      <ConfirmDialog
        opened={confirmArchive}
        title={t('course_detail.archive_confirm_title')}
        message={t('course_detail.archive_confirm_message')}
        confirmLabel={t('course_detail.archive')}
        destructive
        loading={archive.isPending}
        onConfirm={handleArchive}
        onClose={() => setConfirmArchive(false)}
      />

      <ConfirmDialog
        opened={confirmDelete}
        title={t('course_detail.delete_confirm_title')}
        message={t('course_detail.delete_confirm_message', {
          name: course.name,
        })}
        confirmLabel={t('course_detail.delete')}
        destructive
        loading={deleteCourse.isPending}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      {course && (
        <HomeworkCreateDialog
          open={createHwOpen}
          onClose={() => setCreateHwOpen(false)}
          courseId={course.id}
        />
      )}

      {course && (
        <ImportHomeworkDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          course={{ id: course.id, slug: course.slug }}
          onDone={() => navigate(`/courses/${course.slug ?? slug}`)}
        />
      )}
    </Page>
  );
}

// Step ordering — used to render "Шаг N/6" so the user can see how far
// through the import we are and whether anything is moving.
