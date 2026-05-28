/**
 * MyDashboardPage — `/me` student cabinet, the single screen the student
 * actually uses.
 *
 * Per the design call: students have NO sidebar — everything they need
 * lives on this one page. Three sections, all hairline-divided, no card
 * chrome:
 *
 *   1. «Скоро дедлайн»  — up to 5 closest future deadlines across all
 *                          courses.
 *   2. «Мои курсы»      — one row per course with sdano/всего + mean grade
 *                          + a chevron to the course page.
 *   3. «Последние оценки» — up to 5 most-recent graded submissions.
 *
 * Empty (no courses): a single CTA — «Введите код приглашения». That's
 * literally the only thing a fresh self-registered account can do until
 * a teacher hands them a code.
 *
 * The «+ По коду» action lives in the PageHeader so it's always one
 * click away, even when sections below are full.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ChevronRight, KeyRound, Loader2 } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/auth/useAuth';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useMyAssignments } from '@/hooks/api/useAssignments';
import { assignmentKeys } from '@/hooks/api/useAssignments';
import { assignmentsApi } from '@/api/endpoints/assignments';
import type { AssignmentBrief } from '@/api/endpoints/assignments';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { JoinByCodeDialog } from '@/components/courses/JoinByCodeDialog';
import { cn } from '@/components/ui/utils';

type Tone = 'high' | 'mid' | 'low' | 'muted';

const toneText: Record<Tone, string> = {
  high: 'text-sev-high',
  mid: 'text-sev-mid',
  low: 'text-muted-foreground',
  muted: 'text-muted-foreground/70',
};

/** Human countdown for a future deadline. Past deadlines collapse to
 *  «Прошёл» (we don't show them anyway, but the helper handles the case
 *  so callers don't have to guard). */
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

export default function MyDashboardPage() {
  useDocumentTitle('Главная');
  const { user } = useAuth();
  const myCoursesQ = useMyCourses();
  const myAssignmentsQ = useMyAssignments();
  const mySubsQ = useMySubmissions({ limit: 200 });

  const myCourses = myCoursesQ.data?.data ?? [];
  const myAssignments = myAssignmentsQ.data?.data ?? [];
  // mySubmissions response is sometimes a bare array, sometimes Paginated.
  // The hook's TS type covers both; normalise here.
  const subsData = mySubsQ.data as unknown;
  const mySubs: Array<{
    id: string;
    assignment_id: string;
    course_id?: string;
    submitted_at: string;
    score?: number | null;
    max_score?: number | null;
  }> = Array.isArray(subsData)
    ? (subsData as never)
    : ((subsData as { data?: never[] })?.data ?? []);

  const [joinOpen, setJoinOpen] = useState(false);

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

  // -- Per-course aggregates: how many of this course's assignments did
  // -- the student grade-receive? Mean of obtained scores. Skipped when
  // -- the student has no submissions at all (mean = «—»).
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

  // -- Last 10 submissions of any kind, newest first. ----------------- //
  // Earlier this was «only graded», but binding-claim flows (Yandex.Contest
  // participants link → backfill all their imports) deliver lots of
  // ungraded submissions and the student would see an empty section.
  // The score column is shown when present; otherwise we show the
  // assignment's verdict-like status (sent / on review).
  const recent = useMemo(() => {
    return mySubs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.submitted_at).getTime() -
          new Date(a.submitted_at).getTime(),
      )
      .slice(0, 10);
  }, [mySubs]);

  const courseById = useMemo(
    () => new Map(myCourses.map((c) => [c.id, c])),
    [myCourses],
  );

  // /users/me/assignments is ``published_only=True`` — Yandex.Contest
  // binding-imports often produce assignments that aren't published
  // (e.g. teacher's draft contests), and the resulting submissions
  // would render as «Задание» because the lookup misses. To recover
  // those titles, hit /courses/:id/assignments for every course the
  // student belongs to — that endpoint is unfiltered and the rows
  // merge cleanly into the same id-keyed map.
  const perCourseAssignmentsQ = useQueries({
    queries: myCourses.map((c) => ({
      queryKey: [...assignmentKeys.byCourse(c.id), { dashboard: true }],
      queryFn: () =>
        assignmentsApi.listInCourse(c.id, { limit: 500 }),
      enabled: !!c.id,
    })),
  });

  const assignmentById = useMemo(() => {
    const m = new Map<string, AssignmentBrief>(
      myAssignments.map((a) => [a.id, a]),
    );
    for (const q of perCourseAssignmentsQ) {
      for (const a of q.data?.data ?? []) {
        if (!m.has(a.id)) m.set(a.id, a);
      }
    }
    return m;
  }, [myAssignments, perCourseAssignmentsQ]);

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

  // ---- Empty state: no courses yet. ---------------------------------- //
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
                  const course = courseById.get(a.course_id);
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
                const total = courseStats.totalByCourse.get(c.id) ?? 0;
                const graded = courseStats.gradedByCourse.get(c.id);
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

          {recent.length > 0 && (
            <section data-testid="dashboard-recent">
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
                Мои посылки
              </h2>
              <ul className="divide-y divide-border/40 border-t border-border/40">
                {recent.map((s) => {
                  const a = assignmentById.get(s.assignment_id);
                  const max = s.max_score ?? a?.max_score ?? null;
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
                            {a?.title ?? 'Задание'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDate(s.submitted_at)}
                          </div>
                        </div>
                        {hasScore ? (
                          <span className="text-sm font-medium text-foreground tabular-nums shrink-0">
                            {Number(s.score).toFixed(1)}
                            {max != null && (
                              <span className="text-muted-foreground"> / {max}</span>
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
            </section>
          )}
        </div>
      )}

      <JoinByCodeDialog open={joinOpen} onOpenChange={setJoinOpen} />
    </Page>
  );
}
