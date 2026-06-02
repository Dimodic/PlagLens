/**
 * Student "My grades" — table of all graded submissions across courses.
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { t, useTranslation } from '@/i18n';
import { useMySubmissions } from '@/hooks/api/useSubmissions';
import { useMyCourses } from '@/hooks/api/useCourses';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/Page';

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—';

interface StatProps {
  label: string;
  value: string;
}

function Stat({ label, value }: StatProps) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

/** Loading state — mirrors the loaded body: 3 stat cards + a card of rows
 *  (left title/subtitle, right grade pill). Same wrappers/padding as real. */
function GradesSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('skeleton.aria_label')}
      className="space-y-8"
    >
      {/* Stat grid — 3 cards, same layout as the loaded stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="border-border/70">
            <CardContent className="p-5">
              <Skeleton className="h-3 w-20 bg-muted/40" />
              <Skeleton className="mt-2 h-8 w-16 bg-muted/40" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rows card — title/subtitle on the left, grade pill on the right */}
      <Card className="border-border/70">
        <CardContent className="p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 px-5 py-4 ${
                i > 0 ? 'border-t border-border/70' : ''
              }`}
            >
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/2 bg-muted/40" />
                <Skeleton className="h-3 w-1/3 bg-muted/30" />
              </div>
              <Skeleton className="h-7 w-16 flex-none rounded-full bg-muted/40" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyGradesPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('my_grades.title'));
  const subsQ = useMySubmissions();
  const coursesQ = useMyCourses();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subsRaw: any[] = Array.isArray(subsQ.data)
    ? subsQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((subsQ.data as any)?.data ?? []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs = subsRaw.filter((s: any) => s.grade != null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coursesRaw: any[] = Array.isArray(coursesQ.data)
    ? coursesQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((coursesQ.data as any)?.data ?? []);
  const coursesById = new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    coursesRaw.map((c: any) => [String(c.id), c]),
  );

  const avg =
    subs.length > 0
      ? (
          subs.reduce(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (sum: number, s: any) => sum + (Number(s.grade?.score) || 0),
            0,
          ) / subs.length
        ).toFixed(2)
      : '—';

  const best =
    subs.length > 0
      ? Math.max(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...subs.map((s: any) => Number(s.grade?.score) || 0),
        ).toFixed(1)
      : '—';

  const hasNothingYet = subsQ.isPending && subsRaw.length === 0;

  return (
    <Page>
      <PageHeader title={t('my_grades.title')} />

      {hasNothingYet ? (
        <GradesSkeleton />
      ) : (
        <>
          {subs.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Stat
                label={t('my_grades.stat_total')}
                value={String(subs.length)}
              />
              <Stat label={t('my_grades.stat_avg')} value={avg} />
              <Stat label={t('my_grades.stat_best')} value={best} />
            </div>
          )}

          {subs.length === 0 ? (
            <Card className="border-dashed border-border/70">
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                <Link
                  to="/me/assignments"
                  className="text-primary hover:underline"
                >
                  {t('my_grades.empty_cta')}
                </Link>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/70">
              <CardContent className="p-0">
                {subs.map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (s: any, idx: number) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const course: any = coursesById.get(String(s.course_id));
                    const score = Number(s.grade?.score) || 0;
                    const max = Number(s.grade?.max_score) || 10;
                    const ratio = max > 0 ? score / max : 0;
                    const toneClass =
                      ratio >= 0.85
                        ? 'bg-sev-low-bg text-sev-low'
                        : ratio >= 0.6
                          ? 'bg-sev-mid-bg text-sev-mid'
                          : 'bg-sev-high-bg text-sev-high';
                    return (
                      <Link
                        key={s.id}
                        to={`/me/submissions/${s.id}`}
                        data-testid={`my-grade-row-${s.id}`}
                        className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                          idx > 0 ? 'border-t border-border/70' : ''
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-foreground">
                            {s.assignment_title ??
                              t('my_grades.assignment_fallback', {
                                id: s.assignment_id,
                              })}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {course?.name ??
                              t('my_grades.course_fallback', {
                                id: s.course_id,
                              })}{' '}
                            ·{' '}
                            {fmt(s.grade?.graded_at)}
                          </div>
                        </div>
                        <span
                          className={`flex-none rounded-full px-3 py-1 font-mono text-sm font-medium tabular-nums ${toneClass}`}
                          data-testid={`grade-${s.id}`}
                        >
                          {score.toFixed(1)} / {max}
                        </span>
                        <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                      </Link>
                    );
                  },
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Page>
  );
}
