/**
 * StatsPanel — inline-tab panel for the «Статистика» tab on the
 * course page.
 *
 * Pared-down version. The previous build had 8 KPIs across two strips,
 * three charts AND an activity feed, all separated by `border-t`
 * rules — the user read it as "слишком перегружена". This rewrite:
 *  - Shows the four KPIs that actually answer "is this course alive":
 *    Студентов, Заданий, Посылок, Средняя оценка.
 *  - One chart only — grade distribution.
 *  - No dividers, no card chrome — sections are separated by vertical
 *    space only.
 *  - Surfaces fetch errors visibly via ProblemAlert instead of
 *    silently rendering dashes when the API call 4xx-fails (which is
 *    what the user was actually seeing).
 *  - Honest empty state when the course has no data yet.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { cn } from '@/components/ui/utils';
import {
  useCourseDashboard,
  useCourseGradesDist,
} from '@/hooks/api/useDashboards';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Skeleton } from '@/components/ui/skeleton';
import { parseProblem } from '@/api/problem';

interface StatsPanelProps {
  courseId: string;
  /** Kept for backwards compat with old callers; unused now. */
  courseSlug?: string;
}

export function StatsPanel({ courseId }: StatsPanelProps) {
  const overview = useCourseDashboard(courseId);
  const gradesDist = useCourseGradesDist(courseId);

  // Backend returns KPI fields flatly on the dashboard object — see
  // `CourseDashboard` for the contract. There's no `kpi` sub-object.
  const kpi = overview.data;
  const loadingKpi = overview.isLoading;

  // Surface the actual problem instead of pretending the data is just
  // "empty" — when the call 403s (e.g. teacher isn't a course member
  // record), every KPI silently becomes "—" and the user reads the page
  // as broken. Show the error.
  if (overview.error) {
    return (
      <div className="space-y-4" data-testid="stats-panel">
        <ProblemAlert problem={parseProblem(overview.error)} />
      </div>
    );
  }

  return (
    <div className="space-y-8" data-testid="stats-panel">
      {/* ----- KPI strip — 4 numbers, no card chrome, no second row,
              no icon clutter. Title-of-cell is enough. ----- */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
        <KpiCell
          label="Студентов"
          value={kpi?.enrolled_students}
          loading={loadingKpi}
          testId="kpi-enrolled-students"
        />
        <KpiCell
          label="Заданий"
          value={kpi?.assignments_count}
          loading={loadingKpi}
          testId="kpi-assignments-count"
        />
        <KpiCell
          label="Посылок"
          value={kpi?.submissions_total}
          loading={loadingKpi}
          testId="kpi-submissions-total"
        />
        <KpiCell
          label="Средняя оценка"
          value={kpi?.average_score ?? null}
          tone="primary"
          loading={loadingKpi}
          testId="kpi-avg-score"
        />
      </div>

      {/* ----- Grade histogram (only chart) ----- */}
      <div data-testid="grade-histogram">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Распределение оценок
          </h2>
          {gradesDist.data && gradesDist.data.buckets.length > 0 && (
            <div className="text-xs tabular-nums text-muted-foreground">
              среднее{' '}
              <span className="text-foreground">
                {typeof gradesDist.data.mean === 'number'
                  ? gradesDist.data.mean.toFixed(2)
                  : '—'}
              </span>
              <span className="mx-2 text-muted-foreground/40">·</span>
              медиана{' '}
              <span className="text-foreground">
                {typeof gradesDist.data.median === 'number'
                  ? gradesDist.data.median.toFixed(2)
                  : '—'}
              </span>
            </div>
          )}
        </div>
        {gradesDist.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : !gradesDist.data || gradesDist.data.buckets.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Пока нет оценённых посылок
          </p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={gradesDist.data.buckets}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis dataKey="bucket" stroke="var(--muted-foreground)" />
                <YAxis
                  allowDecimals={false}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  cursor={{ fill: 'var(--muted)', fillOpacity: 0.3 }}
                  content={<HistogramTooltip />}
                />
                <Bar
                  dataKey="count"
                  fill="var(--chart-1)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

/** Minimal dark-theme aware tooltip for the recharts bar chart. The
 *  default ships with a white background + light-grey wrapper that
 *  reads as a foreign object on our dark canvas. We render a small
 *  popover that matches the rest of the design system: bucket label
 *  on top, count number below in primary, no chrome. */
interface HistogramTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number | string; payload?: { bucket?: string } }>;
  label?: string | number;
}

function HistogramTooltip({ active, payload, label }: HistogramTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const count = payload[0]?.value ?? '—';
  const bucket = (payload[0]?.payload?.bucket as string | undefined) ?? label;
  return (
    <div className="rounded-md border border-border bg-popover/95 backdrop-blur px-3 py-2 shadow-sm text-xs">
      <div className="text-muted-foreground uppercase tracking-wider">
        {bucket}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-foreground">
        {count}
      </div>
    </div>
  );
}

/** Big number + muted label under it. No card, no icon. */
function KpiCell({
  label,
  value,
  tone = 'default',
  loading,
  testId,
}: {
  label: string;
  value: number | string | null | undefined;
  tone?: 'default' | 'primary';
  loading?: boolean;
  testId?: string;
}) {
  return (
    <div data-testid={testId ?? 'kpi-cell'} className="flex flex-col gap-1">
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div
          className={cn(
            'text-3xl font-semibold leading-none tabular-nums',
            tone === 'primary' && 'text-primary',
          )}
        >
          {formatNumber(value)}
        </div>
      )}
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function formatNumber(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1000)
      return v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }
  return v;
}

export default StatsPanel;
