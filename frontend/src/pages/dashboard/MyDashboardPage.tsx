/**
 * MyDashboardPage — `/me` student cabinet, the single screen the student
 * actually uses.
 *
 * Students have no sidebar; the body lives entirely here. Three hairline-
 * divided sections:
 *
 *   1. «Скоро дедлайн»  — up to 5 closest future deadlines across courses.
 *   2. «Мои курсы»      — one row per course with «сдано/всего» + mean grade.
 *   3. «Мои посылки»    — last N submissions with assignment title, verdict
 *                         (Y.Contest external_verdict coloured by outcome)
 *                         and grade. Filterable by course / status.
 *
 * Title / course name / homework title for every submission come straight
 * from the backend — `/users/me/submissions` joins them in, so we don't
 * have to fan out a useQueries over the course tree to recover assignment
 * titles. ``s.assignment_title`` is the source of truth.
 *
 * Empty state (no courses): one CTA — «Ввести код». «+ По коду» in the
 * header is always one click away regardless.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound, Loader2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/auth/useAuth';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useMyAssignments } from '@/hooks/api/useAssignments';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { JoinByCodeDialog } from '@/components/courses/JoinByCodeDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/components/ui/utils';

type Tone = 'high' | 'mid' | 'low' | 'muted';

const toneText: Record<Tone, string> = {
  high: 'text-sev-high',
  mid: 'text-sev-mid',
  low: 'text-muted-foreground',
  muted: 'text-muted-foreground/70',
};

/** Yandex.Contest-style «passed compilation + tests» verdicts. CE / WA /
 *  PE / RTE never make it to the teacher's queue (the import pipeline
 *  filters them out), so we surface only these on the student dashboard
 *  — the student already saw the red ones in the contest UI. */
function isAcceptedVerdict(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === 'ok' || s === 'accepted';
}

/** Human countdown for a future deadline. Past deadlines collapse to
 *  «Прошёл» (we don't show them anyway). */
function deadlineTag(iso: string | null | undefined): { label: string; tone: Tone } | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  const ms = ts - Date.now();
  if (ms < 0) return { label: 'Прошёл', tone: 'muted' };
  const hours = Math.round(ms / 3_600_000);
  if (hours <= 24) return { label: `Через ${Math.max(1, hours)} ч.`, tone: 'high' };
  const days = Math.round(ms / 86_400_000);
  if (days <= 2) return { label: `Через ${days} дн.`, tone: 'mid' };
  return { label: `Через ${days} дн.`, tone: 'low' };
}

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
      })
    : '';

type StatusFilter = 'all' | 'graded' | 'pending';

interface MySub {
  id: string;
  assignment_id: string;
  course_id?: string;
  submitted_at: string;
  score?: number | null;
  max_score?: number | null;
  external_verdict?: string | null;
  external_score?: number | null;
  assignment_title?: string | null;
  homework_title?: string | null;
  course_name?: string | null;
}

export default function MyDashboardPage() {
  useDocumentTitle('Главная');
  const { user } = useAuth();
  const myCoursesQ = useMyCourses();
  const myAssignmentsQ = useMyAssignments();
  // Backend caps at 10 000; pull a generous slice so the dashboard list
  // isn't artificially limited for power users with lots of Y.Contest
  // imports — the list itself only renders the first N after filters.
  const mySubsQ = useMySubmissions({ limit: 500 });

  const myCourses = myCoursesQ.data?.data ?? [];
  const myAssignments = myAssignmentsQ.data?.data ?? [];
  const subsData = mySubsQ.data as unknown;
  const mySubs: MySub[] = Array.isArray(subsData)
    ? (subsData as MySub[])
    : ((subsData as { data?: MySub[] })?.data ?? []);

  const [joinOpen, setJoinOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  // -- «Скоро дедлайн»: future deadline_hard_at, sorted ascending. ----- //
  const upcoming = useMemo(() => {
    const now = Date.now();
    return myAssignments
      .filter(
        (a) =>
          a.deadline_hard_at && new Date(a.deadline_hard_at).getTime() > now,
      )
      .sort(
        (a, b) =>
          new Date(a.deadline_hard_at!).getTime() -
          new Date(b.deadline_hard_at!).getTime(),
      )
      .slice(0, 5);
  }, [myAssignments]);

  // -- Per-course aggregates. ------------------------------------------ //
  const courseStats = useMemo(() => {
    const totalByCourse = new Map<string, number>();
    for (const a of myAssignments) {
      totalByCourse.set(a.course_id, (totalByCourse.get(a.course_id) ?? 0) + 1);
    }
    const gradedByCourse = new Map<string, { count: number; sum: number }>();
    for (const s of mySubs) {
      if (s.score == null || !s.course_id) continue;
      const cur = gradedByCourse.get(s.course_id) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += Number(s.score);
      gradedByCourse.set(s.course_id, cur);
    }
    return { totalByCourse, gradedByCourse };
  }, [myAssignments, mySubs]);

  const courseById = useMemo(
    () => new Map(myCourses.map((c) => [String(c.id), c])),
    [myCourses],
  );

  // -- Filtered + deduped submissions list. --------------------------- //
  //
  // The teacher's review queue only ever sees Y.Contest «OK» rows — the
  // import pipeline drops CE / WA / PE / RTE before they hit the inbox.
  // Anything else in /users/me/submissions is contest-side noise the
  // student already saw in Y.Contest. Surface only the «passed»
  // submissions, and collapse multiple OK attempts on the same
  // assignment to the latest one (so a student who hit «Submit» five
  // times sees one row, not five).
  //
  // After the OK + latest-per-assignment filter, apply the user's
  // status / course filters on top.
  const filteredSubs = useMemo(() => {
    const acceptedOnly = mySubs.filter((s) =>
      isAcceptedVerdict(s.external_verdict),
    );
    // group by assignment_id, keep newest submitted_at
    const latestByAsg = new Map<string, MySub>();
    for (const s of acceptedOnly) {
      const prev = latestByAsg.get(s.assignment_id);
      if (
        !prev ||
        new Date(s.submitted_at).getTime() >
          new Date(prev.submitted_at).getTime()
      ) {
        latestByAsg.set(s.assignment_id, s);
      }
    }
    let arr = [...latestByAsg.values()];
    if (statusFilter === 'graded') arr = arr.filter((s) => s.score != null);
    else if (statusFilter === 'pending')
      arr = arr.filter((s) => s.score == null);
    if (courseFilter !== 'all')
      arr = arr.filter((s) => String(s.course_id) === courseFilter);
    arr.sort(
      (a, b) =>
        new Date(b.submitted_at).getTime() -
        new Date(a.submitted_at).getTime(),
    );
    return arr;
  }, [mySubs, statusFilter, courseFilter]);

  // Visibility of the «Мои посылки» section itself: hide when the
  // student has 0 OK-attempts (showing an empty list with filters above
  // is just chrome). We compute this off the unfiltered set so toggling
  // a filter to «ничего не подходит» still keeps the section.
  const hasAnyAcceptedSubs = useMemo(
    () => mySubs.some((s) => isAcceptedVerdict(s.external_verdict)),
    [mySubs],
  );

  // How many rows to render in «Мои посылки». 20 is enough to read the
  // recent state at a glance; the detail page handles deep browsing.
  const SUBS_LIMIT = 20;
  const visibleSubs = filteredSubs.slice(0, SUBS_LIMIT);

  const greeting = user?.display_name
    ? `Привет, ${user.display_name.split(' ')[0]}`
    : 'Главная';

  const isLoading =
    myCoursesQ.isLoading || myAssignmentsQ.isLoading || mySubsQ.isLoading;

  const joinAction = (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setJoinOpen(true)}
      data-testid="dashboard-join-by-code"
    >
      <KeyRound className="mr-2 h-4 w-4" />
      По коду
    </Button>
  );

  if (!isLoading && myCourses.length === 0) {
    return (
      <Page width="regular" data-testid="my-dashboard">
        <PageHeader title={<span data-testid="my-dashboard-title">{greeting}</span>} />
        <EmptyState
          data-testid="my-dashboard-empty"
          title="У вас пока нет курсов"
          description="Преподаватель выдаст вам код приглашения — введите его, чтобы попасть в курс."
          action={
            <Button onClick={() => setJoinOpen(true)} data-testid="dashboard-empty-cta">
              <KeyRound className="mr-2 h-4 w-4" />
              Ввести код
            </Button>
          }
        />
        <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
      </Page>
    );
  }

  return (
    <Page width="regular" data-testid="my-dashboard">
      <PageHeader
        title={<span data-testid="my-dashboard-title">{greeting}</span>}
        action={joinAction}
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-10">
          {upcoming.length > 0 && (
            <section data-testid="dashboard-upcoming">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Скоро дедлайн
              </h2>
              <ul className="divide-y divide-border/40 border-t border-border/40">
                {upcoming.map((a) => {
                  const tag = deadlineTag(a.deadline_hard_at);
                  const course = courseById.get(String(a.course_id));
                  return (
                    <li key={a.id}>
                      <Link
                        to={`/me/assignments/${a.id}`}
                        data-testid={`dashboard-upcoming-${a.id}`}
                        className="group flex items-center gap-4 py-3 -mx-2 px-2 rounded-md transition-colors hover:bg-muted/20"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {a.title}
                          </div>
                          {course && (
                            <div className="text-xs text-muted-foreground truncate">
                              {course.name}
                            </div>
                          )}
                        </div>
                        {tag && (
                          <span
                            className={cn(
                              'text-xs shrink-0 tabular-nums',
                              toneText[tag.tone],
                            )}
                          >
                            {tag.label}
                          </span>
                        )}
                        <ChevronRight
                          aria-hidden
                          className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section data-testid="dashboard-courses">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Мои курсы
            </h2>
            <ul className="divide-y divide-border/40 border-t border-border/40">
              {myCourses.map((c) => {
                const total = courseStats.totalByCourse.get(String(c.id)) ?? 0;
                const graded = courseStats.gradedByCourse.get(String(c.id));
                const mean =
                  graded && graded.count > 0
                    ? (graded.sum / graded.count).toFixed(1)
                    : null;
                return (
                  <li key={c.id}>
                    <Link
                      to={`/courses/${c.slug}`}
                      data-testid={`dashboard-course-${c.slug}`}
                      className="group flex items-center gap-4 py-4 -mx-2 px-2 rounded-md transition-colors hover:bg-muted/20"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-medium text-foreground truncate">
                          {c.name}
                        </div>
                        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>
                            {graded?.count ?? 0} из {total} сдано
                          </span>
                          {mean != null && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="tabular-nums">
                                средний балл {mean}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          {hasAnyAcceptedSubs && (
            <section data-testid="dashboard-recent">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                  Мои посылки
                </h2>
                <div className="flex items-center gap-2">
                  <Select
                    value={statusFilter}
                    onValueChange={(v) =>
                      setStatusFilter((v as StatusFilter) ?? 'all')
                    }
                  >
                    <SelectTrigger
                      className="h-8 w-[160px] text-xs"
                      data-testid="dashboard-status-filter"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все</SelectItem>
                      <SelectItem value="graded">Оценённые</SelectItem>
                      <SelectItem value="pending">На проверке</SelectItem>
                    </SelectContent>
                  </Select>
                  {myCourses.length > 1 && (
                    <Select
                      value={courseFilter}
                      onValueChange={(v) => setCourseFilter(v ?? 'all')}
                    >
                      <SelectTrigger
                        className="h-8 w-[180px] text-xs"
                        data-testid="dashboard-course-filter"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все курсы</SelectItem>
                        {myCourses.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {visibleSubs.length === 0 ? (
                <p className="border-t border-border/40 py-6 text-center text-sm text-muted-foreground">
                  Под фильтр ничего не подходит.
                </p>
              ) : (
                <>
                  <ul className="divide-y divide-border/40 border-t border-border/40">
                    {visibleSubs.map((s) => {
                      const title =
                        s.assignment_title ||
                        myAssignments.find((a) => a.id === s.assignment_id)?.title ||
                        'Задание';
                      const hasScore = s.score != null;
                      return (
                        <li key={s.id}>
                          <Link
                            to={`/me/submissions/${s.id}`}
                            data-testid={`dashboard-recent-${s.id}`}
                            className="group flex items-center gap-4 py-3 -mx-2 px-2 rounded-md transition-colors hover:bg-muted/20"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-foreground truncate">
                                {title}
                              </div>
                              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground truncate">
                                <span>{fmtDate(s.submitted_at)}</span>
                                {s.course_name && (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span className="truncate">{s.course_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            {hasScore ? (
                              <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                                {Number(s.score).toFixed(1)}
                                {s.max_score != null && (
                                  <span className="text-muted-foreground"> / {s.max_score}</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground shrink-0">
                                на проверке
                              </span>
                            )}
                            <ChevronRight
                              aria-hidden
                              className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {filteredSubs.length > SUBS_LIMIT && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Показаны последние {SUBS_LIMIT} из {filteredSubs.length}.
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}

      <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </Page>
  );
}
