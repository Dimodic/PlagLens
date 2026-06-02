/**
 * AdminActivityCharts — the two charts on the admin «Обзор», styled to match
 * the app's existing dashboard charts (a shadcn <Card> shell + recharts
 * themed through our CSS color variables):
 *   • a monthly-submissions area chart, and
 *   • a top-courses-by-submissions bar chart.
 *
 * Month labels are localised with Intl keyed to the current UI language
 * (dayjs is globally pinned to ru, which would otherwise show Russian months
 * under an English UI).
 */
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { getLocale, useTranslation } from '@/i18n';
import type { ActivityResponse } from '@/api/endpoints/reporting';

const ACCENT = 'var(--chart-1)';
const GRID = 'var(--border)';
const TICK = { fontSize: 11, fill: 'var(--muted-foreground)' } as const;

const intlLocale = () => (getLocale() === 'en' ? 'en-US' : 'ru-RU');

/** «2025-01» → «Jan 25» / «янв. 25», localised. */
function monthShort(period: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'short',
    year: '2-digit',
  }).format(new Date(`${period}-01T00:00:00`));
}
/** «2025-01» → «January 2025» / «январь 2025». */
function monthLong(period: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${period}-01T00:00:00`));
}
/** Tight axis numbers: 2938 → «2.9k», 3000 → «3k», 66 → «66». */
function compact(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : `${v}`;
}

function ChartShell({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="mb-3">
          <div className="text-sm font-semibold text-foreground">{title}</div>
          {subtitle && (
            <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
        <div className="h-56 w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

function TipBox({
  title,
  label,
  value,
}: {
  title: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-muted-foreground">
        {label}: <span className="tabular-nums text-foreground">{value}</span>
      </div>
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

interface Props {
  data?: ActivityResponse;
  loading?: boolean;
}

export function AdminActivityCharts({ data, loading }: Props) {
  const { t } = useTranslation();
  const series = data?.submissions_series ?? [];
  const seriesTotal = useMemo(
    () => series.reduce((s, d) => s + d.submissions, 0),
    [series],
  );
  const byCourse = useMemo(
    () => (data?.by_course ?? []).filter((c) => c.submissions > 0),
    [data?.by_course],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartShell
        className="lg:col-span-2"
        title={t('tenant_dashboard.chart_submissions')}
        subtitle={t('tenant_dashboard.chart_submissions_sub', {
          months: data?.months ?? 24,
        })}
      >
        {loading ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin" />
          </Centered>
        ) : seriesTotal === 0 ? (
          <Centered>{t('tenant_dashboard.chart_empty')}</Centered>
        ) : (
          <ResponsiveContainer>
            <AreaChart
              data={series}
              margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="pl-sub-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="period"
                tickFormatter={monthShort}
                tick={TICK}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                width={40}
                tickFormatter={compact}
                tick={TICK}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ stroke: GRID }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TipBox
                      title={monthLong(label as string)}
                      label={t('tenant_dashboard.chart_tip_submissions')}
                      value={payload[0].value as number}
                    />
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="submissions"
                stroke={ACCENT}
                strokeWidth={2}
                fill="url(#pl-sub-fill)"
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartShell>

      <ChartShell
        title={t('tenant_dashboard.chart_courses')}
        subtitle={t('tenant_dashboard.chart_courses_sub')}
      >
        {loading ? (
          <Centered>
            <Loader2 className="h-5 w-5 animate-spin" />
          </Centered>
        ) : byCourse.length === 0 ? (
          <Centered>{t('tenant_dashboard.chart_empty')}</Centered>
        ) : (
          <ResponsiveContainer>
            <BarChart
              data={byCourse}
              layout="vertical"
              margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                allowDecimals={false}
                tickFormatter={compact}
                tick={TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: string) =>
                  v.length > 16 ? `${v.slice(0, 15)}…` : v
                }
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TipBox
                      title={(payload[0].payload as { name: string }).name}
                      label={t('tenant_dashboard.chart_tip_submissions')}
                      value={payload[0].value as number}
                    />
                  ) : null
                }
              />
              <Bar
                dataKey="submissions"
                fill={ACCENT}
                radius={[0, 4, 4, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartShell>
    </div>
  );
}

export default AdminActivityCharts;
