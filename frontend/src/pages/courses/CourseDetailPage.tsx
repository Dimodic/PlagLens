/**
 * /courses/:slug — course detail.
 *
 * Layout: header band → description → tabs → homeworks list (default tab).
 * Tabs (homeworks / members / groups / invitations / stats / dashboard /
 * exports / schedules / sheets / suspicious) are link-style: clicking
 * navigates to the matching nested route. Existing data-testids on every
 * tab and row are preserved so Playwright specs continue to pass.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  homeworkKeys,
  useHomeworksForCourse,
} from '@/hooks/api/useHomeworks';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { Page } from '@/components/layout/Page';
import { PageSkeleton, SkeletonList } from '@/components/common/Skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { integrationsApi } from '@/api/endpoints/integrations';
import { formatDate, formatDateTime } from '@/utils/formatters';

// Archive-only lifecycle: draft + active/published collapse into one state.
function statusBadge(status: string) {
  if (status === 'archived')
    return <StatusPill tone="neutral">В архиве</StatusPill>;
  return <StatusPill tone="success">Активен</StatusPill>;
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
      notify.error('Название не может быть пустым');
      return;
    }
    try {
      await updateCourse.mutateAsync({
        name: edit.name.trim(),
        description: edit.description,
        start_date: edit.start || null,
        end_date: edit.end || null,
      });
      notify.success('Сохранено');
      setEditing(false);
    } catch (e) {
      notify.error(parseProblem(e).detail || 'Не удалось сохранить');
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
  const tab: CourseTab = (COURSE_TABS as readonly string[]).includes(
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

  const homeworksQ = useHomeworksForCourse(course?.id, { limit: 100 });
  // YC imports easily push the assignment count past 100; keep the cap high
  // enough so the per-homework counters below ("N заданий") count every
  // assignment, otherwise the freshly-imported homework reads as empty.
  const assignmentsQ = useAssignmentsByCourse(course?.id, {
    limit: 500,
    sort: '-deadline_soft_at',
  });

  // YC import-as-homework dialog: one-shot create new homework from a YC
  // contest + import every problem as an assignment inside it. Triggered
  // from the "+ Новое ДЗ" dropdown.
  const [ycImportOpen, setYcImportOpen] = useState(false);
  const [ycContestId, setYcContestId] = useState('');
  // YC integration is tenant-wide: one connection in /integrations is
  // shared across every course in the tenant. We list all YC configs
  // here (no course_id filter) and pass the current course separately
  // in the import call.
  const ycConfigsQ = useQuery({
    queryKey: ['integrations', 'list', 'yandex_contest'],
    queryFn: () =>
      integrationsApi.list({
        kind: 'yandex_contest',
        limit: 10,
      }),
    enabled: ycImportOpen,
  });
  const ycConfigs = ycConfigsQ.data?.data ?? [];
  const ycConfigId = ycConfigs[0]?.id;
  const qc = useQueryClient();
  // Homework deletion lives inside HomeworkDrawer (its own ConfirmDialog
  // + mutation). The row used to host an inline delete icon, but two
  // icons stacked on the row looked cluttered — settings/drawer is the
  // only per-row action now, and it has Delete + Archive in its footer.

  // Drop the leftover stage state from the previous pseudo-progress impl.
  // The polled op state replaces it entirely.
  const [activeOpId, setActiveOpId] = useState<string | null>(null);
  const opQ = useQuery({
    queryKey: ['integrations', 'yc-import-op', activeOpId],
    queryFn: () => integrationsApi.ycGetImportOperation(activeOpId as string),
    enabled: !!activeOpId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === 'running' ? 2000 : false;
    },
  });
  const ycImportMut = useMutation({
    mutationFn: () => {
      if (!ycConfigId) throw new Error('no_yc_config');
      if (!course?.id) throw new Error('no_course');
      return integrationsApi.ycImportAsHomework(
        ycConfigId,
        ycContestId.trim(),
        course.id,
      );
    },
    onSuccess: (res) => {
      setActiveOpId(res.operation_id);
    },
    onError: (e) => setProblem(parseProblem(e)),
  });

  // Watch the polled op state: navigate on completion, surface error.
  useEffect(() => {
    const op = opQ.data;
    if (!op || !activeOpId) return;
    if (op.status === 'completed' && op.homework_slug) {
      const title = op.homework_title ?? 'ДЗ';
      const created = op.problems_done ?? 0;
      const subs = op.submissions_imported ?? 0;
      notify.success(
        op.resync
          ? `ДЗ «${title}» досинхронизировано · посылок: ${subs}`
          : `ДЗ «${title}». Задач: ${created} · посылок: ${subs}`,
      );
      setActiveOpId(null);
      setYcImportOpen(false);
      setYcContestId('');
      void qc.invalidateQueries({
        queryKey: homeworkKeys.forCourse(course?.id ?? ''),
      });
      // HW detail page is gone — stay on the course page; the freshly
      // imported ДЗ shows up in the inline list once the query above
      // invalidates.
      navigate(`/courses/${course?.slug ?? slug}`);
    } else if (op.status === 'failed') {
      const msg = (op.errors ?? []).join('; ') || 'Импорт упал';
      notify.error(msg);
      setActiveOpId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opQ.data]);

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
      notify.success('Курс архивирован');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleDelete = async () => {
    setConfirmDelete(false);
    try {
      await deleteCourse.mutateAsync();
      notify.success('Курс удалён');
      navigate('/courses');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleDuplicate = async () => {
    try {
      const clone = await duplicate.mutateAsync();
      notify.success('Курс скопирован');
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
      notify.success('Курс восстановлен');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const assignments = assignmentsQ.data?.data ?? [];

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
              placeholder="Название курса"
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
                    {statusBadge(course.status)}
                  </span>
                )}
                {course.start_date && (
                  <span>
                    {formatDate(course.start_date)} –{' '}
                    {formatDate(course.end_date ?? null)}
                  </span>
                )}
                {typeof course.members_count === 'number' && (
                  <span>{course.members_count} участников</span>
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
              Отмена
            </Button>
            <Button
              onClick={onSaveCourse}
              disabled={updateCourse.isPending}
              data-testid="course-edit-save"
            >
              {updateCourse.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </div>
        ) : isOwner ? (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={startEditing}
              title="Редактировать"
              aria-label="Редактировать"
              data-testid="course-detail-settings-button"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Ещё"
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
                  Дублировать структуру
                </DropdownMenuItem>
                {course.status !== 'archived' ? (
                  <DropdownMenuItem
                    onSelect={() => setConfirmArchive(true)}
                    className="text-amber-600 focus:text-amber-600"
                    data-testid="course-detail-archive"
                  >
                    Архивировать
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() => void handleUnarchive()}
                    className="text-emerald-600 focus:text-emerald-600"
                    data-testid="course-detail-unarchive"
                  >
                    Восстановить
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onSelect={() => setConfirmDelete(true)}
                  className="text-destructive focus:text-destructive"
                  data-testid="course-detail-delete"
                >
                  Удалить
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
          placeholder="Описание курса…"
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

      {/* Tabs — four real tabs: ДЗ, Участники, Статистика, Подозрительные.
          Groups, Invitations, Dashboard, Exports, Scheduled exports and
          the legacy Google Sheets link were dropped — their routes
          redirect back here. Suspicious survived because it has its
          own decision-making workflow that doesn't fit on the Stats
          dashboard. */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="homeworks">
            <span data-testid="course-detail-tab-homeworks">ДЗ</span>
            {(homeworksQ.data?.data ?? []).length > 0 && (
              <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                {(homeworksQ.data?.data ?? []).length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="members">
            <span data-testid="course-detail-tab-members">Участники</span>
          </TabsTrigger>
          <TabsTrigger value="stats">
            <span data-testid="course-detail-tab-stats">Статистика</span>
          </TabsTrigger>
          <TabsTrigger value="suspicious">
            <span data-testid="course-detail-tab-suspicious">
              Подозрительные
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Homeworks list (default tab content) */}
      {tab === 'homeworks' && (
        <div className="space-y-4">
          {isOwner && (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-testid="course-detail-create-homework">
                    <Plus className="mr-2 h-4 w-4" />
                    Новое ДЗ
                    <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      navigate(`/courses/${course.slug}/homeworks/new`)
                    }
                    data-testid="course-detail-create-homework-manual"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Вручную
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setYcImportOpen(true)}
                    data-testid="course-detail-create-homework-yc"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Из Yandex.Contest
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {homeworksQ.isLoading && !homeworksQ.data ? (
            <SkeletonList rows={3} rowHeight={48} />
          ) : (homeworksQ.data?.data ?? []).length === 0 ? (
            <div
              className="py-16 text-center text-sm text-muted-foreground"
              data-testid="course-detail-homeworks-empty"
            >
              Нет домашних заданий
            </div>
          ) : (
            <div
              className="flex flex-col"
              data-testid="course-detail-homeworks-list"
            >
              <div className="contents">
                {(homeworksQ.data?.data ?? []).map((hw) => {
                  const hwAsgCount = assignments.filter(
                    (a) =>
                      a.homework_id != null &&
                      String(a.homework_id) === String(hw.id),
                  ).length;
                  const meta = [
                    hw.due_at ? `Дедлайн ${formatDateTime(hw.due_at)}` : null,
                    `${hwAsgCount} заданий`,
                  ]
                    .filter(Boolean)
                    .join(' · ');
                  const hwId = String(hw.id);
                  const isOpen = expandedHws.has(hwId);
                  // Filter+sort the assignments that belong to THIS hw —
                  // the parent already loaded all course assignments
                  // (limit 500) so no extra fetch. Assignment ids are
                  // sequential ints; sort ascending reproduces the
                  // import order (A → Z for YC contests, oldest-first
                  // for manual creates).
                  const hwAssignments = assignments
                    .filter(
                      (a) =>
                        a.homework_id != null &&
                        String(a.homework_id) === hwId,
                    )
                    .sort((a, b) => Number(a.id) - Number(b.id));
                  return (
                    <div
                      key={hw.id}
                      data-testid={`course-hw-row-${hw.id}`}
                      className="flex flex-col"
                    >
                      <div className="group flex items-center gap-2 rounded-md px-1 py-3 transition-colors hover:bg-muted/30">
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
                        {hw.status === 'archived' && (
                          <span className="text-xs text-muted-foreground/70">
                            в архиве
                          </span>
                        )}
                        {/* Single per-row action: open the drawer. Delete +
                            Archive live inside the drawer footer to avoid
                            stacking icons on the row (looked cluttered). */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrawerHwId(hwId);
                          }}
                          aria-label="Просмотр и настройки ДЗ"
                          data-testid={`course-hw-settings-${hw.id}`}
                          className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded opacity-60 group-hover:opacity-100 transition-opacity"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      </div>
                      {isOpen && (
                        <div
                          className="pl-6 pb-2"
                          data-testid={`course-hw-expanded-${hw.id}`}
                        >
                          {hwAssignments.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-muted-foreground">
                              В этом ДЗ ещё нет заданий
                            </p>
                          ) : (
                            <ul className="flex flex-col">
                              {hwAssignments.map((a) => (
                                <li key={a.id}>
                                  <Link
                                    to={`/assignments/${a.id}`}
                                    data-testid={`course-hw-assignment-${a.id}`}
                                    className="flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/30"
                                  >
                                    <span className="min-w-0 flex-1 truncate text-foreground">
                                      {a.title}
                                    </span>
                                    {a.language_hint && (
                                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                        {a.language_hint}
                                      </span>
                                    )}
                                    {a.status === 'archived' && (
                                      <span className="text-xs text-muted-foreground/70">
                                        в архиве
                                      </span>
                                    )}
                                    <ChevronRight className="h-3 w-3 flex-none text-muted-foreground" />
                                  </Link>
                                </li>
                              ))}
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
        title="Архивировать курс?"
        message="Курс перестанет быть активным. Это можно отменить."
        confirmLabel="Архивировать"
        destructive
        loading={archive.isPending}
        onConfirm={handleArchive}
        onClose={() => setConfirmArchive(false)}
      />

      <ConfirmDialog
        opened={confirmDelete}
        title="Удалить курс?"
        message={`Курс «${course.name}» будет удалён без возможности восстановления. Все ДЗ, задания и посылки внутри будут потеряны.`}
        confirmLabel="Удалить"
        destructive
        loading={deleteCourse.isPending}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      <Dialog
        open={ycImportOpen}
        onOpenChange={(o) => {
          if (!o) setYcImportOpen(false);
        }}
      >
        <DialogContent data-testid="course-detail-yc-import-modal">
          <DialogHeader>
            <DialogTitle>Импорт ДЗ из Yandex.Contest</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Создаст новое ДЗ с названием контеста и импортирует все задачи
              как задания внутри него (условия, ограничения времени/памяти).
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="course-yc-import-contest-id">ID контеста</Label>
              <Input
                id="course-yc-import-contest-id"
                value={ycContestId}
                onChange={(e) => setYcContestId(e.target.value)}
                placeholder="73433"
                inputMode="numeric"
                autoFocus
                data-testid="course-yc-import-contest-id"
              />
              {ycConfigsQ.isLoading && (
                <p className="text-xs text-muted-foreground">
                  Ищу подключение Yandex.Contest…
                </p>
              )}
              {!ycConfigsQ.isLoading && ycConfigs.length === 0 && (
                <p className="text-xs text-destructive">
                  Yandex.Contest не подключён. Подключи в{' '}
                  <Link to="/integrations" className="underline">
                    /integrations
                  </Link>
                  .
                </p>
              )}
              {ycConfigs.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Подключение: {ycConfigs[0].display_name ?? ycConfigs[0].id}
                  {ycConfigs.length > 1 && ` (+${ycConfigs.length - 1} ещё)`}
                </p>
              )}
            </div>
            {(ycImportMut.isPending || activeOpId) && (
              <ImportProgress op={opQ.data} pending={ycImportMut.isPending} />
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setYcImportOpen(false)}
                disabled={ycImportMut.isPending || !!activeOpId}
                data-testid="course-yc-import-cancel"
              >
                Отмена
              </Button>
              <Button
                onClick={() => ycImportMut.mutate()}
                disabled={
                  ycImportMut.isPending ||
                  !!activeOpId ||
                  !ycContestId.trim() ||
                  !ycConfigId
                }
                data-testid="course-yc-import-submit"
              >
                {ycImportMut.isPending || activeOpId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Импортировать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}

// Step ordering — used to render "Шаг N/6" so the user can see how far
// through the import we are and whether anything is moving.
const STAGE_ORDER: string[] = [
  'starting',
  'fetching_contest',
  'creating_homework',
  'creating_assignments',
  'fetching_submissions',
  'importing_submissions',
  'done',
];
const STAGE_LABELS: Record<string, string> = {
  starting: 'Запускаюсь…',
  fetching_contest: 'Подключаюсь к Yandex.Contest…',
  creating_homework: 'Создаю ДЗ…',
  creating_assignments: 'Создаю задания…',
  fetching_submissions: 'Загружаю посылки студентов…',
  importing_submissions: 'Импортирую посылки в систему…',
  done: 'Готово',
  already_imported: 'Контест уже импортирован',
};

type YcImportOp = {
  status?: 'running' | 'completed' | 'failed' | 'expired';
  stage?: string | null;
  homework_title?: string | null;
  problems_total?: number;
  problems_done?: number;
  submissions_fetched?: number;
  submissions_imported?: number;
  updated_at?: number | null;
  errors?: string[] | null;
  resync?: boolean;
};

function ImportProgress({
  op,
  pending,
}: {
  op?: YcImportOp;
  pending: boolean;
}) {
  const stage = op?.stage ?? 'starting';
  const label = STAGE_LABELS[stage] ?? `Импорт идёт… (${stage})`;
  const problemsTotal = op?.problems_total ?? 0;
  const problemsDone = op?.problems_done ?? 0;
  const subsFetched = op?.submissions_fetched ?? 0;
  const subsImported = op?.submissions_imported ?? 0;
  const problemsPct = problemsTotal > 0
    ? Math.round((problemsDone / problemsTotal) * 100)
    : 0;
  const isFetching = stage === 'fetching_submissions';
  const subsPct = subsFetched > 0
    ? Math.round((subsImported / subsFetched) * 100)
    : 0;

  // Step counter — "Шаг 3 / 6". Step `starting` is index 0 (counted as
  // "Шаг 1"); `done` is the final step. Indeterminate while the op
  // hasn't reported a stage yet.
  const stepIdx = STAGE_ORDER.indexOf(stage);
  const showSteps = stepIdx >= 0 && op?.status !== 'completed';
  const totalSteps = STAGE_ORDER.length - 1; // -1 because `done` isn't a step

  const isFailed = op?.status === 'failed';
  const isCompleted = op?.status === 'completed';
  // Tick a clock so the "обновлено N с назад" row ticks even between
  // backend polls. ``updated_at`` is unix-seconds float written by Redis.
  const now = useRealtimeClock(2_000, !!op && !isCompleted && !isFailed);
  const lastUpdateSec =
    typeof op?.updated_at === 'number' ? now / 1000 - op.updated_at : null;

  return (
    <div
      data-testid="course-yc-import-progress"
      className="space-y-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5 text-sm"
    >
      <div className="flex items-center gap-2">
        {isFailed ? (
          <span className="h-2 w-2 rounded-full bg-destructive" />
        ) : isCompleted ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <span className={isFailed ? 'text-destructive' : undefined}>
          {pending && !op
            ? 'Запускаюсь…'
            : isFailed
              ? 'Импорт упал'
              : label}
        </span>
        {showSteps && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            шаг {Math.min(stepIdx + 1, totalSteps)} / {totalSteps}
          </span>
        )}
      </div>
      {op?.homework_title && (
        <div className="pl-5 text-xs text-muted-foreground">
          «{op.homework_title}»
        </div>
      )}
      {problemsTotal > 0 && (
        <div className="space-y-1 pl-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Задания</span>
            <span className="tabular-nums">
              {problemsDone} / {problemsTotal}
            </span>
          </div>
          <Progress value={problemsPct} className="h-1.5" />
        </div>
      )}
      {subsFetched > 0 && (
        <div className="space-y-1 pl-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Посылки</span>
            <span className="tabular-nums">
              {isFetching
                ? subsFetched
                : `${subsImported} / ${subsFetched}`}
            </span>
          </div>
          {isFetching ? (
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
              <div className="absolute inset-0 yc-import-stripes" />
            </div>
          ) : (
            <Progress value={subsPct} className="h-1.5" />
          )}
        </div>
      )}
      {/* Heartbeat — quiet "обновлено N с" timestamp so the user can see
          the polling is alive without the (alarming) "возможно зависло"
          copy. We keep the staleness flag in code; if we ever need to
          surface it we can do it as a colour shift, not a warning string. */}
      {op?.updated_at !== undefined && op?.updated_at !== null && !isCompleted && (
        <div className="pl-5 text-xs text-muted-foreground/60 tabular-nums">
          обновлено {Math.max(0, Math.round(lastUpdateSec ?? 0))} с назад
        </div>
      )}
      {isFailed && (op?.errors?.length ?? 0) > 0 && (
        <div className="pl-5 text-xs text-destructive">
          {(op?.errors ?? []).slice(0, 3).join(' · ')}
        </div>
      )}
    </div>
  );
}

/** Returns a state value that updates every `intervalMs` while `active`. */
function useRealtimeClock(intervalMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, active]);
  return now;
}
