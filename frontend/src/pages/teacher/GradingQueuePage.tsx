/**
 * «Кабинет ассистента» (/grading) — the assistant's home.
 *
 * A grading cockpit over the submissions assigned to the current user:
 *   • a progress header (remaining / total + a bar + «Начать проверку»),
 *   • a queue grouped «по задачам» (homework) or «по студентам», each row
 *     showing how much is left, click → jump straight into grading the
 *     next unchecked submission of that group.
 *
 * Backed by GET /users/me/submissions (staff inbox) filtered to
 * ``assigned_grader_id = me`` and collapsed latest-per-student — always
 * the assistant's OWN pile (handing-out work lives on «Все посылки»).
 * The queue is narrowed by the same курс → ДЗ → задание cascade the
 * triage uses, so the cabinet reads as a focused view of one's tasks.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import { FilterCombo } from '@/components/common/FilterCombo';
import { SkeletonList } from '@/components/common/Skeleton';
import { cn } from '@/components/ui/utils';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useAssignmentsByCourse } from '@/hooks/api/useAssignments';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { displayAuthor } from '@/api/endpoints/submissions';

interface QueueGroup {
  key: string;
  label: string;
  total: number;
  remaining: number;
  /** id of the first unchecked submission in the group — the jump target. */
  next?: string;
  /** ordered ids of the group's UNCHECKED submissions — the review queue
   *  handed to the submission page when this group (or the whole pile) is
   *  opened, so its ‹/› counter reads "X из <remaining>". */
  ids: string[];
}

export default function GradingQueuePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('grading_queue.title'));
  const { user } = useAuth();
  const navigate = useNavigate();
  const myId = user?.id;

  const coursesQ = useMyCourses();
  const courseItems = coursesQ.data?.data ?? [];

  // курс → ДЗ → задание cascade (same as «Все посылки»). '' = «все».
  const [course, setCourse] = useState(''); // '' = все курсы
  const [homework, setHomework] = useState('');
  const [assignment, setAssignment] = useState('');
  const [groupBy, setGroupBy] = useState<'tasks' | 'students'>('tasks');

  // Cascade resets: a new course wipes ДЗ + задание; a new ДЗ wipes the
  // задание. Otherwise a stale id from a previous course filters to nothing.
  useEffect(() => {
    setHomework('');
    setAssignment('');
  }, [course]);
  useEffect(() => {
    setAssignment('');
  }, [homework]);

  // ДЗ / задание options for the picked course.
  const hwQ = useHomeworksForCourse(course || undefined, { limit: 200 });
  const asgQ = useAssignmentsByCourse(course || undefined, { limit: 500 });
  const courseHomeworks = useMemo(() => hwQ.data?.data ?? [], [hwQ.data]);
  const courseAssignments = useMemo(() => asgQ.data?.data ?? [], [asgQ.data]);

  // Assignments of the picked ДЗ — the задание picker's options + the
  // id scope sent to the list when no single задание is picked.
  const homeworkAssignments = useMemo(() => {
    if (!homework) return [];
    return courseAssignments
      .filter(
        (a) => a.homework_id != null && String(a.homework_id) === homework,
      )
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [homework, courseAssignments]);
  const effectiveAsgIds = useMemo<string[]>(() => {
    if (assignment) return [assignment];
    if (homework) return homeworkAssignments.map((a) => String(a.id));
    return [];
  }, [assignment, homework, homeworkAssignments]);

  const { data, isPending } = useMySubmissions({
    limit: 5000,
    offset: 0,
    ...(course ? { course_id: course } : {}),
    ...(effectiveAsgIds.length > 0 ? { assignment_ids: effectiveAsgIds } : {}),
    // The cabinet is always the assistant's OWN pile.
    ...(myId ? { assigned_grader_id: myId } : {}),
    latest_per_student: true,
  });
  const subs = useMemo(() => data?.data ?? [], [data]);

  const total = subs.length;
  const graded = subs.filter((s) => s.is_graded).length;
  const remaining = total - graded;
  const pct = total ? Math.round((graded / total) * 100) : 0;

  const courseName = course
    ? courseItems.find((c) => String(c.id) === course)?.name ??
      t('grading_queue.course_fallback')
    : null;
  const hasFilter = !!(course || homework || assignment);

  const groups = useMemo<QueueGroup[]>(() => {
    const m = new Map<string, QueueGroup>();
    for (const s of subs) {
      let key: string;
      let label: string;
      if (groupBy === 'students') {
        key = s.author_id ?? s.id;
        label = displayAuthor(s);
      } else {
        label =
          s.homework_title ??
          s.assignment_title ??
          t('grading_queue.no_homework');
        key = label;
      }
      const g = m.get(key) ?? { key, label, total: 0, remaining: 0, ids: [] };
      g.total += 1;
      if (!s.is_graded) {
        g.remaining += 1;
        g.ids.push(s.id);
        if (!g.next) g.next = s.id;
      }
      m.set(key, g);
    }
    return [...m.values()].sort(
      (a, b) =>
        b.remaining - a.remaining || a.label.localeCompare(b.label, 'ru'),
    );
  }, [subs, groupBy, t]);

  // The whole remaining pile in grouped display order — the queue handed to
  // the review page so its ‹/› counter reads "X из <remaining>". Stored in
  // sessionStorage on entry (the review page walks it; survives refresh) and
  // rebuilt every time the assistant re-enters — since this is recomputed
  // from the freshly-fetched pile, it shrinks 24 → 22 as they grade.
  const reviewAllIds = useMemo(() => groups.flatMap((g) => g.ids), [groups]);
  const beginReview = (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      sessionStorage.setItem('plaglens.review.queue', JSON.stringify(ids));
    } catch {
      /* sessionStorage unavailable — review page falls back to the peer feed */
    }
    navigate(`/submissions/${ids[0]}`);
  };

  return (
    <Page width="regular" data-testid="assistant-cabinet">
      <PageHeader title={t('grading_queue.title')} />

      {/* Progress header — remaining / total + bar + «Начать проверку». */}
      <div className="rounded-xl border border-border/70 bg-muted/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {courseName
                ? t('grading_queue.remaining_in_course', { course: courseName })
                : t('grading_queue.remaining_label')}
            </div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">
              {remaining}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                {t('grading_queue.of_total_assigned', { total })}
              </span>
            </div>
          </div>
          <Button
            onClick={() => beginReview(reviewAllIds)}
            disabled={reviewAllIds.length === 0}
            data-testid="assistant-start-review"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {t('grading_queue.start_review')}
          </Button>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs tabular-nums text-muted-foreground">
          {t('grading_queue.progress', { graded, total, pct })}
        </div>
      </div>

      {/* Queue */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">
            {t('grading_queue.queue_heading')}
          </h2>
          {/* курс → ДЗ → задание cascade (same controls as «Все посылки»). */}
          <FilterCombo
            value={course}
            onChange={setCourse}
            allLabel={t('grading_queue.all_courses')}
            searchPlaceholder={t('grading_queue.find_course')}
            testId="assistant-course"
            options={courseItems.map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
          />
          {course && courseHomeworks.length > 0 && (
            <FilterCombo
              value={homework}
              onChange={setHomework}
              allLabel={t('grading_queue.all_homeworks')}
              searchPlaceholder={t('grading_queue.find_homework')}
              testId="assistant-hw"
              options={courseHomeworks.map((hw) => ({
                value: String(hw.id),
                label: hw.title,
              }))}
            />
          )}
          {homework && homeworkAssignments.length > 1 && (
            <FilterCombo
              value={assignment}
              onChange={setAssignment}
              allLabel={t('grading_queue.all_tasks')}
              searchPlaceholder={t('grading_queue.find_task')}
              testId="assistant-task"
              options={homeworkAssignments.map((a) => ({
                value: String(a.id),
                label: a.title,
              }))}
            />
          )}
          <div className="flex-1" />
          <div className="inline-flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setGroupBy('tasks')}
              className={cn(
                'transition-colors',
                groupBy === 'tasks'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('grading_queue.group_by_tasks')}
            </button>
            <button
              type="button"
              onClick={() => setGroupBy('students')}
              className={cn(
                'transition-colors',
                groupBy === 'students'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('grading_queue.group_by_students')}
            </button>
          </div>
        </div>

        {isPending && subs.length === 0 ? (
          <SkeletonList rows={4} rowHeight={56} />
        ) : groups.length === 0 ? (
          <div
            className="py-10 text-center text-sm text-muted-foreground"
            data-testid="assistant-empty"
          >
            {hasFilter
              ? t('grading_queue.empty_filter')
              : t('grading_queue.empty_unassigned')}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {groups.map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  disabled={g.ids.length === 0}
                  onClick={() => beginReview(g.ids)}
                  className="group flex w-full items-center gap-4 px-3 py-3.5 text-left transition-colors hover:bg-muted/30 disabled:cursor-default disabled:opacity-60"
                  data-testid={`assistant-queue-row`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {g.label}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {g.remaining > 0
                        ? t('grading_queue.group_remaining', {
                            remaining: g.remaining,
                            total: g.total,
                          })
                        : t('grading_queue.group_done', { total: g.total })}
                    </div>
                  </div>
                  {g.next && (
                    <ChevronRight className="h-4 w-4 flex-none text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
