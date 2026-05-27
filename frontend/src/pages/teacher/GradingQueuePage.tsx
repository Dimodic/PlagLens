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
 * ``assigned_grader_id = me`` and collapsed latest-per-student — the same
 * data the «Все посылки» triage uses, here rolled up into counts.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/Page';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SkeletonList } from '@/components/common/Skeleton';
import { cn } from '@/components/ui/utils';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { displayAuthor } from '@/api/endpoints/submissions';

interface QueueGroup {
  key: string;
  label: string;
  total: number;
  remaining: number;
  /** id of the first unchecked submission in the group — the jump target. */
  next?: string;
}

export default function GradingQueuePage() {
  useDocumentTitle('Кабинет ассистента');
  const { user } = useAuth();
  const navigate = useNavigate();
  const myId = user?.id;

  const coursesQ = useMyCourses();
  const courseItems = coursesQ.data?.data ?? [];

  const [course, setCourse] = useState(''); // '' = все курсы
  const [mineOnly, setMineOnly] = useState(true); // «Мои» vs «Все в курсе»
  const [groupBy, setGroupBy] = useState<'tasks' | 'students'>('tasks');

  const { data, isPending } = useMySubmissions({
    limit: 5000,
    offset: 0,
    ...(course ? { course_id: course } : {}),
    ...(mineOnly && myId ? { assigned_grader_id: myId } : {}),
    latest_per_student: true,
  });
  const subs = useMemo(() => data?.data ?? [], [data]);

  const total = subs.length;
  const graded = subs.filter((s) => s.is_graded).length;
  const remaining = total - graded;
  const pct = total ? Math.round((graded / total) * 100) : 0;

  const courseName = course
    ? courseItems.find((c) => String(c.id) === course)?.name ?? 'курс'
    : null;

  const firstUngraded = subs.find((s) => !s.is_graded);
  const startReview = () => {
    if (firstUngraded) navigate(`/submissions/${firstUngraded.id}`);
  };

  const groups = useMemo<QueueGroup[]>(() => {
    const m = new Map<string, QueueGroup>();
    for (const s of subs) {
      let key: string;
      let label: string;
      if (groupBy === 'students') {
        key = s.author_id ?? s.id;
        label = displayAuthor(s);
      } else {
        label = s.homework_title ?? s.assignment_title ?? 'Без ДЗ';
        key = label;
      }
      const g = m.get(key) ?? { key, label, total: 0, remaining: 0 };
      g.total += 1;
      if (!s.is_graded) {
        g.remaining += 1;
        if (!g.next) g.next = s.id;
      }
      m.set(key, g);
    }
    return [...m.values()].sort(
      (a, b) =>
        b.remaining - a.remaining || a.label.localeCompare(b.label, 'ru'),
    );
  }, [subs, groupBy]);

  return (
    <Page width="regular" data-testid="assistant-cabinet">
      <PageHeader title="Кабинет ассистента" />

      {/* Progress header — remaining / total + bar + «Начать проверку». */}
      <div className="rounded-xl border border-border/70 bg-muted/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {courseName ? `В «${courseName}» осталось` : 'Осталось проверить'}
            </div>
            <div className="mt-1 text-4xl font-semibold tabular-nums">
              {remaining}
              <span className="ml-2 text-base font-normal text-muted-foreground">
                из {total} {mineOnly ? 'назначенных' : 'в курсе'}
              </span>
            </div>
          </div>
          <Button
            onClick={startReview}
            disabled={!firstUngraded}
            data-testid="assistant-start-review"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Начать проверку
          </Button>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Проверено <span className="tabular-nums">{graded}</span> из{' '}
          <span className="tabular-nums">{total}</span> · {pct}%
        </div>
      </div>

      {/* Queue */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">Очередь</h2>
          <Select
            value={course || '__all__'}
            onValueChange={(v) => setCourse(v === '__all__' ? '' : v)}
          >
            <SelectTrigger
              className="h-9 w-[220px]"
              data-testid="assistant-course"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Все курсы</SelectItem>
              {courseItems.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="inline-flex items-center rounded-full bg-muted/40 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMineOnly(true)}
              className={cn(
                'rounded-full px-3 py-1 transition-colors',
                mineOnly
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Мои
            </button>
            <button
              type="button"
              onClick={() => setMineOnly(false)}
              className={cn(
                'rounded-full px-3 py-1 transition-colors',
                !mineOnly
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Все в курсе
            </button>
          </div>
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
              по задачам
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
              по студентам
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
            {mineOnly
              ? 'На вас пока ничего не распределено.'
              : 'Посылок нет.'}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border/60">
            {groups.map((g) => (
              <li key={g.key}>
                <button
                  type="button"
                  disabled={!g.next}
                  onClick={() => g.next && navigate(`/submissions/${g.next}`)}
                  className="group flex w-full items-center gap-4 px-3 py-3.5 text-left transition-colors hover:bg-muted/30 disabled:cursor-default disabled:opacity-60"
                  data-testid={`assistant-queue-row`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {g.label}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {g.remaining > 0
                        ? `Осталось ${g.remaining} из ${g.total}`
                        : `Проверено · ${g.total}`}
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
