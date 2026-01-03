/**
 * /assignments/:id — assignment detail.
 *
 * Two-column layout: a wide left column with description + active tab content
 * (submissions / stats / plagiarism / AI), and a narrow right column with
 * quick stats, recent runs and side actions. Tabs use shadcn `<Tabs>`.
 *
 * Archive-only lifecycle: we no longer surface a draft/published distinction —
 * everything not archived renders as "Активен". The backend still stores
 * `draft` as a status, but the only user-visible action is archiving.
 *
 * Test-ids preserved: assignment-detail, assignment-title,
 * assignment-status-badge, assignment-language-badge, assignment-description,
 * assignment-upload-button, assignment-settings-button,
 * assignment-actions-menu, assignment-action-{duplicate,archive}.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  MoreHorizontal,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import {
  useArchiveAssignment,
  useAssignment,
  useDuplicateAssignment,
} from '@/hooks/api/useAssignments';
import {
  useAssignmentAggregateStats,
  useAssignmentGrades,
  useDistributeSubmissions,
  useLatestPerStudent,
} from '@/hooks/api/useSubmissions';
import { useCourseMembers } from '@/hooks/api/useCourses';
import { useUsers } from '@/hooks/api/useUsers';
import { displayAuthor } from '@/api/endpoints/submissions';
import type {
  AssignmentAggregateStats,
  SubmissionBrief,
  SubmissionGrade,
} from '@/api/endpoints/submissions';
import type { PlagiarismRun } from '@/api/endpoints/plagiarism';
import {
  useDeleteRun,
  usePairs,
  usePlagiarismRuns,
  useRunPlagiarism,
} from '@/hooks/api/usePlagiarism';
import { cn } from '@/components/ui/utils';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useAnalysesForAssignment } from '@/hooks/api/useAi';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { useNotifications } from '@/hooks/useNotifications';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePersistedTabState } from '@/hooks/usePersistedTabState';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page } from '@/components/layout/Page';
import { PageSkeleton, SkeletonList } from '@/components/common/Skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/common/StatusPill';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimilarityBar } from '@/components/plagiarism/SimilarityBar';
import { Pagination } from '@/components/common/Pagination';
import { formatDate, formatDateTime } from '@/utils/formatters';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

function statusBadge(status: string) {
  // Archive-only lifecycle: collapse draft/published into a single
  // "Активен" pill. Only "archived" is visually distinct.
  if (status === 'archived')
    return <StatusPill tone="neutral">В архиве</StatusPill>;
  return <StatusPill tone="success">Активен</StatusPill>;
}

type TabId = 'submissions' | 'stats' | 'plagiarism' | 'ai' | 'about';

type RunStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | string;

function runStatusBadge(status: RunStatus) {
  if (status === 'completed')
    return <StatusPill tone="success">Готово</StatusPill>;
  if (status === 'running')
    return <StatusPill tone="info">Выполняется</StatusPill>;
  if (status === 'failed')
    return <StatusPill tone="destructive">Ошибка</StatusPill>;
  if (status === 'cancelled')
    return <StatusPill tone="neutral">Отменено</StatusPill>;
  return <StatusPill tone="neutral">В очереди</StatusPill>;
}


function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

export default function AssignmentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { data: assignment, isLoading, error } = useAssignment(id);
  // Collapse multiple attempts from the same author into a single row by
  // pulling the latest-per-student list. The version popover on the
  // submission page still lets the grader walk through earlier tries.
  const SUBS_PAGE_SIZE = 25;
  const [subsPage, setSubsPage] = useState(1);
  const { data: latestPerStudent, isLoading: latestLoading } =
    useLatestPerStudent(id);
  // Backend stats: submission_service aggregates submissions × grades
  // in a single DB query and exposes them at
  // ``GET /assignments/:id/aggregate-stats``. The Stats tab consumes
  // these directly for the metric strip; histogram + timeline still
  // need the raw ``grades`` array for binning client-side.
  const { data: aggStats, isLoading: aggStatsLoading } =
    useAssignmentAggregateStats(id);
  const { data: grades, isLoading: gradesLoading } = useAssignmentGrades(id);
  // Only one plagiarism state per assignment now — pull just the
  // latest run, no separate recent-runs list.
  const { data: runsAll, isLoading: runsLoading } = usePlagiarismRuns(id, {
    limit: 1,
  });
  const { data: aiAnalyses, isLoading: aiLoading } =
    useAnalysesForAssignment(id, { limit: 25 });
  const archiveMut = useArchiveAssignment(id);
  const duplicateMut = useDuplicateAssignment(id);
  const runPlag = useRunPlagiarism(id, assignment?.course_id ?? undefined);

  // Plagiarism-run deletion (soft delete on backend). Two-step UX so a
  // misclick on the trash icon doesn't nuke a run silently.
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const deleteRunMut = useDeleteRun(runToDelete ?? '');

  const [problem, setProblem] = useState<Problem | null>(null);

  useDocumentTitle(assignment?.title);

  const isTeacher = useMemo(() => {
    if (!user || !assignment) return false;
    if (
      hasCourseRole(user, assignment.course_id, ['owner', 'co_owner', 'assistant'])
    ) {
      return true;
    }
    if (hasGlobalRole(user, ['admin', 'super_admin', 'teacher'])) return true;
    return false;
  }, [user, assignment]);

  const initialTab: TabId = isTeacher ? 'submissions' : 'about';
  // Persisted per-assignment so leaving for a plagiarism run / a
  // submission and coming back lands on the tab the user left off on,
  // not always "Посылки".
  const [tab, setTab] = usePersistedTabState<TabId>(
    `assignment:${id}`,
    initialTab,
  );

  // Submissions tab data — one row per student, sorted newest first.
  // ``useMemo`` must live *above* the early returns below, otherwise the
  // hook order changes between loading / loaded renders and React throws
  // "Rendered more hooks than during the previous render."
  const latestList = latestPerStudent?.data ?? [];
  const latestSorted = useMemo(
    () =>
      [...latestList].sort((a, b) =>
        (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''),
      ),
    [latestList],
  );

  // ``submission_id → score`` so each row in the submissions list can
  // surface the grade without an extra round-trip per row. Sourced from
  // the bulk grades endpoint that we already load for the Stats tab.
  // ``Number(...)`` because the backend's Numeric/Decimal columns can
  // serialize as JSON strings — calling .toFixed on a string blows up.
  const gradeBySubmission = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of grades ?? []) {
      if (g.score != null) m.set(g.submission_id, Number(g.score));
    }
    return m;
  }, [grades]);

  // Assistants of this assignment's course — feed the "distribute among
  // assistants" round-robin on the submissions tab. The course service
  // stores no names, so resolve them from the tenant user list.
  const { data: courseMembers } = useCourseMembers(
    assignment?.course_id,
    'assistant',
  );
  const { data: tenantUsers } = useUsers({ limit: 200 });
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of tenantUsers?.data ?? []) m.set(u.id, u.display_name);
    return m;
  }, [tenantUsers]);
  const assistants = useMemo(
    () =>
      (courseMembers?.data ?? [])
        .filter((m) => m.role === 'assistant')
        .map((m) => ({
          id: m.user_id,
          name: nameById.get(m.user_id) ?? m.user_id,
        })),
    [courseMembers, nameById],
  );
  const distribute = useDistributeSubmissions();
  const [distributeOpen, setDistributeOpen] = useState(false);

  // The two-column layout binds tightly to `assignment`; keep an early return
  // but render a Page-shaped skeleton (header + tabs + rows) so the
  // viewport doesn't reflow when data lands. After the first request the
  // page revisits resolve from cache.
  if (isLoading && !assignment) {
    return <PageSkeleton width="wide" />;
  }
  if (error || !assignment) {
    return <ProblemAlert problem={parseProblem(error)} />;
  }

  // Non-teachers only ever see the "Описание" tab — clamp here so a
  // stale persisted value (or a teacher tab) can never leak through.
  const activeTab: TabId = isTeacher ? tab : 'about';
  const latestTotal = latestSorted.length;
  const latestPageStart = (subsPage - 1) * SUBS_PAGE_SIZE;
  const submissionList = latestSorted.slice(
    latestPageStart,
    latestPageStart + SUBS_PAGE_SIZE,
  );
  const handleArchive = async () => {
    try {
      await archiveMut.mutateAsync();
      notify.success('Задание архивировано');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateMut.mutateAsync(undefined);
      notify.info('Дублирование запущено');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleRunPlag = async () => {
    try {
      const op = await runPlag.mutateAsync({});
      notify.info('Проверка запущена');
      if ((op as { run_id?: string }).run_id) {
        navigate(`/plagiarism-runs/${(op as { run_id?: string }).run_id}`);
      }
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  const handleDistribute = async () => {
    if (assistants.length === 0) return;
    try {
      const res = await distribute.mutateAsync({
        assignment_id: id,
        graders: assistants,
      });
      notify.success(
        `Распределено ${res.assigned} посылок между ${res.graders} ассистентами` +
          (res.skipped > 0 ? ` (${res.skipped} уже были назначены)` : ''),
      );
      setDistributeOpen(false);
    } catch (e) {
      setProblem(parseProblem(e));
      setDistributeOpen(false);
    }
  };

  return (
    <Page width="wide" data-testid="assignment-detail">
      <div data-assignment-id={assignment.id} className="space-y-6">
        {/* Header — same minimal pass as Course / Homework details. The
            slug eyebrow, "Активен" pill, language pill, max-score and
            weight are all secondary; we surface them as quiet inline meta
            instead of competing badges. Border-b dropped. "В архиве"
            still gets a pill since that's the only state that actually
            informs the teacher. */}
        <div className="flex items-start gap-6">
          <div className="flex-1 min-w-0">
            <h1
              data-testid="assignment-title"
              className="text-2xl font-semibold tracking-tight"
            >
              {assignment.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {assignment.status === 'archived' && (
                <span data-testid="assignment-status-badge">
                  {statusBadge(assignment.status)}
                </span>
              )}
              {assignment.language_hint && (
                <span
                  data-testid="assignment-language-badge"
                  className="font-mono"
                >
                  {assignment.language_hint}
                </span>
              )}
              {assignment.deadline_soft_at && (
                <span>Срок {formatDate(assignment.deadline_soft_at)}</span>
              )}
              {assignment.max_score != null && (
                <span>
                  макс.{' '}
                  <span className="tabular-nums">{assignment.max_score}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isTeacher && (
              <Button asChild data-testid="assignment-upload-button">
                <Link to={`/assignments/${assignment.id}/upload`}>
                  <Upload className="mr-2 h-4 w-4" />
                  Загрузить посылку
                </Link>
              </Button>
            )}
            {isTeacher && (
              <>
                <Button
                  onClick={handleRunPlag}
                  disabled={runPlag.isPending}
                  variant="outline"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Запустить проверку
                </Button>
                <Button
                  asChild
                  variant="outline"
                  data-testid="assignment-settings-button"
                >
                  <Link to={`/assignments/${assignment.id}/settings`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Настройки
                  </Link>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Ещё"
                      data-testid="assignment-actions-menu"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => void handleDuplicate()}
                      data-testid="assignment-action-duplicate"
                    >
                      Дублировать
                    </DropdownMenuItem>
                    {assignment.status !== 'archived' && (
                      <DropdownMenuItem
                        onSelect={() => void handleArchive()}
                        className="text-amber-600 focus:text-amber-600"
                        data-testid="assignment-action-archive"
                      >
                        Архивировать
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {problem && <ProblemAlert problem={problem} />}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setTab(v as TabId)}>
          <TabsList>
            {/* "Описание" available to everyone — teachers also want to read
                the condition (it's the source of truth for grading) but in
                a tab, not as a giant block above every other tab. */}
            <TabsTrigger value="about">Описание</TabsTrigger>
            {isTeacher && (
              <>
                <TabsTrigger value="submissions">
                  Посылки
                  {/* Count = number of students who submitted (latest-
                      per-student rows), NOT total submission attempts.
                      The submission popover surfaces the attempts. */}
                  {latestTotal > 0 && (
                    <span className="ml-2 text-xs tabular-nums text-muted-foreground">
                      {latestTotal}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="stats">Статистика</TabsTrigger>
                <TabsTrigger value="plagiarism">Плагиат</TabsTrigger>
                <TabsTrigger value="ai">AI-анализ</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Body — design-system §4 Pattern D: 1fr main + 280px rail. */}
          <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_240px]">
            {/* LEFT */}
            <div className="min-w-0 space-y-6">
              <TabsContent value="about" className="mt-0">
                {assignment.description ? (
                  // Plain prose, no Card chrome — design-system §7 antipattern:
                  // "Card вокруг каждой секции". YC HTML rendered via
                  // dangerouslySetInnerHTML after sanitizeHtml strip.
                  <div
                    data-testid="assignment-description"
                    className="text-sm leading-relaxed text-foreground/90 assignment-prose"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeHtml(assignment.description),
                    }}
                  />
                ) : (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Описание не задано.
                  </div>
                )}
              </TabsContent>

              <TabsContent value="submissions" className="mt-0">
                {/* No "Все посылки →" link — the submissions are right
                    here, paginated. The dedicated /submissions page was
                    a duplicate destination showing the same rows. */}
                {/* "Распределить между ассистентами" — round-robins this
                    assignment's submissions across the course's
                    assistants. Disabled (with a hint) when the course
                    has none. */}
                {isTeacher && submissionList.length > 0 && (
                  <div className="flex justify-end pb-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDistributeOpen(true)}
                      disabled={
                        distribute.isPending || assistants.length === 0
                      }
                      title={
                        assistants.length === 0
                          ? 'В курсе нет ассистентов'
                          : undefined
                      }
                      data-testid="assignment-distribute-submissions"
                    >
                      {distribute.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Users className="mr-2 h-4 w-4" />
                      )}
                      Распределить между ассистентами
                    </Button>
                  </div>
                )}
                {/* Three states the tab needs to render:
                    1. fetch in flight — show skeleton rows so the tab
                       doesn't lie with "Посылок пока нет" while data
                       is on its way.
                    2. fetched, list empty — the actual "no submissions"
                       message.
                    3. data — the row list. */}
                {latestLoading && submissionList.length === 0 ? (
                  <SkeletonList rows={6} rowHeight={56} />
                ) : submissionList.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {subsPage === 1 ? 'Посылок пока нет.' : 'На этой странице пусто.'}
                  </div>
                ) : (
                  // Flat list, same minimalism as the homework / course
                  // detail rows: no card chrome, no row-borders, no
                  // "Готово" pill (every imported submission is ready —
                  // the pill carried no information). Similarity is shown
                  // only when there's an actual value; otherwise the cell
                  // is empty rather than a dash. Failed / processing rows
                  // get a small inline marker.
                  <div className="mt-2 flex flex-col">
                    {submissionList.map((s) => {
                      const sim =
                        (s as { similarity?: number }).similarity ?? null;
                      const author = displayAuthor(s);
                      const score = gradeBySubmission.get(s.id);
                      // Coerce — assignment.max_score is typed number
                      // but the backend Decimal column serializes as a
                      // JSON string ("10.00"), and strings have no
                      // .toFixed.
                      const maxScore =
                        assignment.max_score != null
                          ? Number(assignment.max_score)
                          : null;
                      return (
                        <div
                          key={s.id}
                          onClick={() => navigate(`/submissions/${s.id}`)}
                          className="group flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-muted/30"
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                              {initials(author)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground truncate">
                              {author}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatDateTime(s.submitted_at)} ·{' '}
                              {s.language ?? '—'}
                              {/* The row shows the *latest* attempt — make
                                  the version count meaningful with Russian
                                  pluralisation. */}
                              {' · '}
                              {s.version} {(() => {
                                const n = s.version;
                                const mod10 = n % 10;
                                const mod100 = n % 100;
                                if (mod10 === 1 && mod100 !== 11) return 'попытка';
                                if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
                                  return 'попытки';
                                return 'попыток';
                              })()}
                            </div>
                          </div>
                          {sim != null && sim > 0 && (
                            <SimilarityBar
                              value={sim}
                              width={140}
                              showLabel={false}
                            />
                          )}
                          {s.status === 'error' && (
                            <span className="text-xs text-destructive">
                              ошибка
                            </span>
                          )}
                          {s.status === 'processing' && (
                            <span className="text-xs text-muted-foreground">
                              обработка
                            </span>
                          )}
                          {/* Assigned assistant — shown after the
                              teacher distributed this assignment. */}
                          {s.assigned_grader_name && (
                            <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:inline-flex">
                              <Users className="h-3 w-3" />
                              {s.assigned_grader_name}
                            </span>
                          )}
                          {/* Grade chip — only when graded; null score
                              renders nothing so ungraded rows stay quiet. */}
                          {score != null ? (
                            <span className="font-mono text-sm tabular-nums text-foreground/90 shrink-0">
                              {score % 1 === 0 ? score.toFixed(0) : score.toFixed(2)}
                              {maxScore != null && (
                                <span className="text-muted-foreground">
                                  {' / '}
                                  {maxScore % 1 === 0
                                    ? maxScore.toFixed(0)
                                    : maxScore.toFixed(2)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60 shrink-0">
                              без оценки
                            </span>
                          )}
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                      );
                    })}
                  </div>
                )}
                <Pagination
                  page={subsPage}
                  pageSize={SUBS_PAGE_SIZE}
                  total={latestTotal}
                  onPageChange={setSubsPage}
                />
              </TabsContent>

              <TabsContent value="stats" className="mt-0">
                <StatsTab
                  submissions={latestSorted}
                  grades={grades ?? []}
                  aggStats={aggStats ?? null}
                  latestRun={(runsAll?.data ?? [])[0] ?? null}
                  aiCount={(aiAnalyses?.data ?? []).length}
                  maxScore={
                    assignment.max_score != null
                      ? Number(assignment.max_score)
                      : null
                  }
                  isLoading={
                    latestLoading ||
                    gradesLoading ||
                    aggStatsLoading ||
                    runsLoading ||
                    aiLoading
                  }
                />
              </TabsContent>

              <TabsContent value="plagiarism" className="mt-0">
                <PlagiarismTab
                  latest={(runsAll?.data ?? [])[0] ?? null}
                  isLoading={runsLoading && !runsAll}
                  isTeacher={isTeacher}
                  onRun={handleRunPlag}
                  onDelete={(id) => setRunToDelete(id)}
                  starting={runPlag.isPending}
                />
              </TabsContent>

              <TabsContent value="ai" className="mt-0">
                {/* No Card chrome — same minimalism as Plagiarism tab. */}
                <div className="flex justify-end pb-3">
                  <Link
                    to={`/assignments/${assignment.id}/ai-analyses`}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Все анализы →
                  </Link>
                </div>
                {aiLoading && !aiAnalyses ? (
                  <SkeletonList rows={3} rowHeight={48} />
                ) : (aiAnalyses?.data ?? []).length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    Анализов нет
                  </div>
                ) : (
                  <div data-testid="assignment-ai-analyses" className="flex flex-col">
                    {(aiAnalyses?.data ?? []).map((a) => (
                      <div
                        key={a.id}
                        onClick={() =>
                          navigate(
                            `/submissions/${a.submission_id}/ai-report`,
                          )
                        }
                        data-testid={`assignment-ai-row-${a.id}`}
                        className="grid grid-cols-[1.6fr_120px_90px_110px_24px] items-center gap-4 cursor-pointer px-2 py-3 rounded-md transition-colors hover:bg-muted/40"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">
                            {a.author?.display_name ??
                              a.submission_id.slice(0, 12)}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {a.provider} · {a.model} ·{' '}
                            {a.finished_at
                              ? formatDateTime(a.finished_at)
                              : 'в процессе'}
                          </div>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground tabular-nums">
                          {a.total_tokens} ток.
                        </div>
                        <div className="font-mono text-xs text-muted-foreground tabular-nums">
                          {a.latency_ms} мс
                        </div>
                        <div>{runStatusBadge(a.status)}</div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground justify-self-end" />
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </div>

            {/* RIGHT — единственная секция «Действия», без дубля
                «Запустить проверку» (она уже в шапке) и без дубля
                статистики (есть полноценный таб «Статистика»). */}
            <aside className="min-w-0 text-sm">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Действия
              </h2>
              <div className="flex flex-col gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-start"
                >
                  <Link to={`/assignments/${assignment.id}/submissions`}>
                    <FileText className="mr-2 h-4 w-4" />
                    Все посылки
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full justify-start"
                >
                  <Link to={`/assignments/${assignment.id}/deadlines`}>
                    <Clock className="mr-2 h-4 w-4" />
                    Дедлайны
                  </Link>
                </Button>
              </div>
            </aside>
          </div>
        </Tabs>
      </div>

      {/* Plagiarism-run delete confirm. Destructive language because
          deletion is currently soft on the backend but the row is
          gone from every list/query the user can reach. */}
      <ConfirmDialog
        opened={!!runToDelete}
        title="Удалить проверку?"
        message="Запуск пропадёт из списка проверок. Историю pairs/clusters восстановить не получится. Можно запустить новую проверку — она пересчитает заново."
        confirmLabel="Удалить"
        destructive
        loading={deleteRunMut.isPending}
        onConfirm={async () => {
          try {
            await deleteRunMut.mutateAsync();
            notify.success('Проверка удалена');
            setRunToDelete(null);
          } catch (e) {
            setProblem(parseProblem(e));
            setRunToDelete(null);
          }
        }}
        onClose={() => setRunToDelete(null)}
      />

      {/* Distribute confirm — previews the round-robin (count of
          assistants + their names) before the bulk write. */}
      <ConfirmDialog
        opened={distributeOpen}
        title="Распределить между ассистентами"
        message={
          `Непроверенные посылки задания будут равномерно распределены ` +
          `между ${assistants.length} ассистентами: ` +
          `${assistants.map((a) => a.name).join(', ')}. ` +
          `Уже распределённые посылки не затрагиваются.`
        }
        confirmLabel="Распределить"
        loading={distribute.isPending}
        onConfirm={handleDistribute}
        onClose={() => setDistributeOpen(false)}
      />
    </Page>
  );
}

/** Plagiarism tab content — document-style per design-system.md:
 *    "Card count = 0 для документ-страниц", секции через hairline border-t.
 *  Three branches:
 *    • no run yet → minimal empty state (icon + 1 line + 1 button)
 *    • run queued/running → minimal progress state
 *    • completed/failed → hero row → stats strip → top pairs
 */
function PlagiarismTab({
  latest,
  isLoading,
  isTeacher,
  onRun,
  onDelete,
  starting,
}: {
  latest: PlagiarismRun | null;
  isLoading: boolean;
  isTeacher: boolean;
  onRun: () => void;
  onDelete: (id: string) => void;
  starting: boolean;
}) {
  const navigate = useNavigate();
  // Top suspicious pairs — fetched only when we have a completed run.
  const enabledPairs = !!latest && latest.status === 'completed';
  const topPairsQ = usePairs(
    latest?.id ?? '',
    { limit: 5, sort: '-similarity', min_similarity: 0.5 },
    { enabled: enabledPairs },
  );
  const topPairs = topPairsQ.data?.data ?? [];

  if (isLoading) {
    return <SkeletonList rows={5} rowHeight={48} />;
  }

  // Empty state: design-system §5 EmptyState — icon → ОДНА строка → ОДНА кнопка.
  if (!latest) {
    return (
      <div className="py-16 flex flex-col items-center text-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          Проверка ещё не запускалась
        </p>
        {isTeacher && (
          <Button
            onClick={onRun}
            disabled={starting}
            data-testid="assignment-tab-plagiarism-start"
          >
            {starting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Запустить проверку
          </Button>
        )}
      </div>
    );
  }

  const pending = latest.status === 'queued' || latest.status === 'running';
  const failed = latest.status === 'failed' || latest.status === 'cancelled';

  // Pending — same minimalism: spinner + одна строка.
  if (pending) {
    return (
      <div className="py-16 flex flex-col items-center text-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {latest.submissions_count > 0
            ? `Идёт проверка · ${latest.submissions_count} посылок`
            : 'Идёт проверка'}
        </p>
      </div>
    );
  }

  const simPct = (latest.max_similarity * 100).toFixed(1);
  const finishedAt = latest.finished_at
    ? formatDateTime(latest.finished_at)
    : '—';
  const provider = latest.provider;
  const matchesCount = latest.pairs_suspected;
  const tone: 'success' | 'destructive' =
    matchesCount > 0 ? 'destructive' : 'success';

  return (
    <div className="space-y-8">
      {/* Hero row — status pill + meta + actions, без Card chrome. */}
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone={failed ? 'destructive' : tone}>
          {failed
            ? 'Ошибка'
            : matchesCount > 0
              ? `${matchesCount} ${
                  matchesCount === 1
                    ? 'совпадение'
                    : matchesCount < 5
                      ? 'совпадения'
                      : 'совпадений'
                }`
              : 'Совпадений нет'}
        </StatusPill>
        <span className="text-sm text-muted-foreground">{finishedAt}</span>
        <span className="text-xs text-muted-foreground/70 uppercase tracking-wider">
          {provider}
        </span>
        <div className="flex-1" />
        {isTeacher && (
          <>
            <Button
              onClick={onRun}
              disabled={starting}
              data-testid="assignment-tab-plagiarism-start"
              size="sm"
              variant="outline"
            >
              {starting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Перепроверить
            </Button>
            <button
              type="button"
              onClick={() => onDelete(latest.id)}
              aria-label="Удалить проверку"
              data-testid={`assignment-plag-run-${latest.id}-delete`}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-muted/60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {failed && latest.error?.detail && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive whitespace-pre-wrap">
          {latest.error.detail}
        </div>
      )}

      {!failed && (
        <>
          {/* Stats — горизонтальная полоса с divide-x, как StatsPanel. */}
          <div className="flex flex-wrap divide-x divide-border/50 border-y border-border/50 py-5">
            <div className="flex-1 min-w-[140px] px-5 first:pl-0">
              <div className="text-xs text-muted-foreground">
                Подозр-ных пар
              </div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
                {matchesCount}
              </div>
            </div>
            <div className="flex-1 min-w-[140px] px-5">
              <div className="text-xs text-muted-foreground">
                Max similarity
              </div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
                {simPct}%
              </div>
            </div>
            <div className="flex-1 min-w-[140px] px-5">
              <div className="text-xs text-muted-foreground">Посылок</div>
              <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
                {latest.submissions_count}
              </div>
            </div>
            <div className="flex-1 min-w-[140px] px-5 last:pr-0">
              <div className="text-xs text-muted-foreground">Запущен</div>
              <div className="mt-1.5 font-mono text-sm tabular-nums">
                {latest.started_at
                  ? formatDateTime(latest.started_at)
                  : '—'}
              </div>
            </div>
          </div>

          {/* Top suspicious pairs — секция без Card, с тонкими разделителями. */}
          {matchesCount > 0 && (
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Топ подозрительных пар
                </h2>
                <div className="flex-1" />
                <Link
                  to={`/plagiarism-runs/${latest.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Открыть карту →
                </Link>
              </div>
              {topPairsQ.isLoading ? (
                <SkeletonList rows={3} rowHeight={40} />
              ) : topPairs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Пар выше порога 50% не нашлось.
                </p>
              ) : (
                <div className="-mx-2 flex flex-col">
                  {topPairs.map((p) => {
                    const aName =
                      p.a_author?.display_name ?? 'студент A';
                    const bName =
                      p.b_author?.display_name ?? 'студент B';
                    const pct = (p.similarity * 100).toFixed(1);
                    const high = p.similarity >= 0.85;
                    return (
                      <div
                        key={p.id}
                        onClick={() =>
                          navigate(
                            `/plagiarism-runs/${latest.id}/pairs/${p.id}`,
                          )
                        }
                        className="group flex items-center gap-3 cursor-pointer py-2.5 px-2 rounded-md transition-colors hover:bg-muted/30"
                        data-testid={`assignment-plag-pair-${p.id}`}
                      >
                        <span
                          className={cn(
                            'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                            high ? 'bg-red-500' : 'bg-amber-500',
                          )}
                        />
                        <span className="min-w-0 flex-1 text-sm text-foreground truncate">
                          <span className="font-medium">{aName}</span>
                          <span className="text-muted-foreground"> ↔ </span>
                          <span className="font-medium">{bName}</span>
                        </span>
                        <span className="font-mono text-sm tabular-nums text-foreground/90">
                          {pct}%
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Stats tab — backend ``/assignments/:id/stats`` is still a stub
 *  returning zeros, so until that proxy lands we compute everything
 *  client-side from data already loaded for the page. Renders:
 *    • horizontal metric strip (StatsPanel pattern)
 *    • score histogram bucketed against assignment.max_score
 *    • submission timeline by day
 *    • language pills (only if >1 distinct language)
 */
function StatsTab({
  submissions,
  grades,
  aggStats,
  latestRun,
  aiCount,
  maxScore,
  isLoading,
}: {
  submissions: SubmissionBrief[];
  grades: SubmissionGrade[];
  aggStats: AssignmentAggregateStats | null;
  latestRun: PlagiarismRun | null;
  aiCount: number;
  maxScore: number | null;
  isLoading: boolean;
}) {
  // ---- metric strip: prefer backend aggregate (single SQL query) and
  //      fall back to client-side counts so the page still renders if
  //      the new endpoint isn't reachable yet. ----
  const submissionsCount =
    aggStats?.submissions_count ?? submissions.length;
  const studentsCount = aggStats?.students_submitted ?? submissionsCount;
  const lateCount =
    aggStats?.late_count ?? submissions.filter((s) => s.is_late).length;

  // Score-by-submission map still needed for the histogram below (the
  // backend gives us the aggregate, but binning needs raw scores).
  // ``Number(...)`` so a string-serialized Numeric never sneaks into
  // arithmetic (e.g. reduce + would string-concat).
  const scoreBySubmission = new Map<string, number>();
  for (const g of grades) {
    if (g.score != null) {
      scoreBySubmission.set(g.submission_id, Number(g.score));
    }
  }
  const scoredCount = aggStats?.graded_count ?? scoreBySubmission.size;
  const scoresArr = Array.from(scoreBySubmission.values());
  // ``aggStats.average_score`` comes off a Numeric column → can arrive
  // as a JSON string; coerce so the ``.toFixed`` in the metric strip
  // doesn't blow up. Client-side fallback is already numeric.
  const meanScoreRaw =
    aggStats?.average_score ??
    (scoresArr.length > 0
      ? scoresArr.reduce((a, b) => a + b, 0) / scoresArr.length
      : null);
  const meanScore = meanScoreRaw == null ? null : Number(meanScoreRaw);

  const plagAlerts =
    latestRun?.status === 'completed' ? latestRun.pairs_suspected : 0;

  // ---- histogram ----
  const HIST_BINS = 10;
  const maxS = maxScore && maxScore > 0 ? maxScore : 10;
  const bins = Array<number>(HIST_BINS).fill(0);
  for (const s of scoresArr) {
    const ratio = Math.max(0, Math.min(1, s / maxS));
    // Right-edge inclusive on the last bin so a perfect score still
    // lands in bucket HIST_BINS-1 rather than HIST_BINS.
    const idx = ratio === 1 ? HIST_BINS - 1 : Math.floor(ratio * HIST_BINS);
    bins[idx]++;
  }
  const maxBin = Math.max(...bins, 1);

  // ---- timeline ----
  const dayMap = new Map<string, number>();
  for (const s of submissions) {
    if (!s.submitted_at) continue;
    const d = s.submitted_at.slice(0, 10); // YYYY-MM-DD
    dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
  }
  const days = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const maxDay = Math.max(...days.map(([, n]) => n), 1);

  // ---- languages ----
  const langMap = new Map<string, number>();
  for (const s of submissions) {
    const lang = s.language ?? '—';
    langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
  }
  const langs = [...langMap.entries()].sort(([, a], [, b]) => b - a);

  if (isLoading && submissionsCount === 0) {
    return <SkeletonList rows={5} rowHeight={48} />;
  }

  if (submissionsCount === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        Посылок пока нет — статистика появится после первых сдач.
      </div>
    );
  }

  const metrics: { label: string; value: number | string }[] = [
    { label: 'Посылок', value: submissionsCount },
    { label: 'Студентов', value: studentsCount },
    {
      label: 'Средний балл',
      value: meanScore == null ? '—' : meanScore.toFixed(2),
    },
    { label: 'Оценено', value: `${scoredCount} / ${submissionsCount}` },
    { label: 'Поздних', value: lateCount },
    { label: 'Алертов', value: plagAlerts },
    { label: 'AI-анализов', value: aiCount },
  ];

  return (
    <div className="space-y-10">
      {/* Horizontal metric strip — design-system §5 StatsPanel. */}
      <div className="flex flex-wrap divide-x divide-border/50 border-y border-border/50 py-5">
        {metrics.map((it, i) => (
          <div
            key={i}
            className="flex-1 min-w-[110px] px-5 first:pl-0 last:pr-0"
          >
            <div className="text-xs text-muted-foreground">{it.label}</div>
            <div className="mt-1.5 font-mono text-2xl font-semibold tabular-nums">
              {it.value}
            </div>
          </div>
        ))}
      </div>

      {/* Score histogram. */}
      <section>
        <div className="flex items-baseline mb-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Распределение оценок
          </h2>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            из {maxS}{maxScore == null ? ' (без max)' : ''}
          </span>
        </div>
        {scoredCount === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            Никого ещё не оценили.
          </p>
        ) : (
          <ScoreHistogram bins={bins} maxBin={maxBin} maxScore={maxS} />
        )}
      </section>

      {/* Submission timeline. */}
      <section>
        <div className="flex items-baseline mb-4">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Когда сдавали
          </h2>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {days.length} {days.length === 1 ? 'день' : 'дней'}
          </span>
        </div>
        <SubmissionTimeline days={days} maxCount={maxDay} />
      </section>

      {/* Languages — show only if multi-language assignment. */}
      {langs.length > 1 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4">
            Языки
          </h2>
          <div className="flex flex-wrap gap-2">
            {langs.map(([lang, n]) => (
              <span
                key={lang}
                className="inline-flex items-center gap-2 rounded-full border border-border/70 px-3 py-1 text-xs"
              >
                <span className="font-medium">{lang}</span>
                <span className="text-muted-foreground tabular-nums">{n}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Tiny SVG bar histogram. Scaled to viewBox so it stays crisp at any
 *  width. Bar fill uses the primary token so it follows theme changes
 *  (light/dark). */
function ScoreHistogram({
  bins,
  maxBin,
  maxScore,
}: {
  bins: number[];
  maxBin: number;
  maxScore: number;
}) {
  const W = 600;
  const H = 180;
  const padL = 24;
  const padR = 8;
  const padT = 18;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = innerW / bins.length;
  const tickValues = [0, maxScore / 2, maxScore];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* baseline */}
      <line
        x1={padL}
        y1={padT + innerH}
        x2={W - padR}
        y2={padT + innerH}
        className="stroke-border/60"
        strokeWidth={1}
      />
      {bins.map((n, i) => {
        const barH = (n / maxBin) * innerH;
        const x = padL + i * barW;
        const y = padT + innerH - barH;
        return (
          <g key={i}>
            <rect
              x={x + 2}
              y={y}
              width={Math.max(barW - 4, 2)}
              height={barH}
              rx={2}
              className="fill-primary/70"
            />
            {n > 0 && (
              <text
                x={x + barW / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-foreground/70 text-[10px] tabular-nums"
              >
                {n}
              </text>
            )}
          </g>
        );
      })}
      {tickValues.map((v, i) => (
        <text
          key={i}
          x={padL + (v / maxScore) * innerW}
          y={H - 8}
          textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
          className="fill-muted-foreground text-[10px] tabular-nums"
        >
          {v.toFixed(maxScore < 5 ? 1 : 0)}
        </text>
      ))}
    </svg>
  );
}

/** Submission-per-day bar chart. Sorted ascending by date; the X axis
 *  marks only first / last day to stay legible when there are many
 *  bars. Each bar's `<title>` gives the exact count on hover. */
function SubmissionTimeline({
  days,
  maxCount,
}: {
  days: [string, number][];
  maxCount: number;
}) {
  const W = 600;
  const H = 160;
  const padL = 24;
  const padR = 8;
  const padT = 14;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const barW = innerW / Math.max(days.length, 1);

  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        Нет данных по датам сдач.
      </p>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto"
      preserveAspectRatio="xMidYMid meet"
    >
      <line
        x1={padL}
        y1={padT + innerH}
        x2={W - padR}
        y2={padT + innerH}
        className="stroke-border/60"
        strokeWidth={1}
      />
      {days.map(([date, n], i) => {
        const barH = (n / maxCount) * innerH;
        const x = padL + i * barW;
        const y = padT + innerH - barH;
        return (
          <rect
            key={date}
            x={x + 1}
            y={y}
            width={Math.max(barW - 2, 1)}
            height={barH}
            rx={1}
            className="fill-primary/70"
          >
            <title>{`${date} · ${n}`}</title>
          </rect>
        );
      })}
      {/* Edge labels — month-day */}
      <text
        x={padL}
        y={H - 8}
        className="fill-muted-foreground text-[10px] tabular-nums"
      >
        {days[0][0].slice(5)}
      </text>
      {days.length > 1 && (
        <text
          x={W - padR}
          y={H - 8}
          textAnchor="end"
          className="fill-muted-foreground text-[10px] tabular-nums"
        >
          {days[days.length - 1][0].slice(5)}
        </text>
      )}
      {/* Max-count tick on Y axis */}
      <text
        x={padL - 4}
        y={padT + 4}
        textAnchor="end"
        className="fill-muted-foreground text-[10px] tabular-nums"
      >
        {maxCount}
      </text>
    </svg>
  );
}
