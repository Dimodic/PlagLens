/**
 * LiveMetricsCharts — the admin «Обзор» «system pulse»: four auto-refreshing
 * charts fed by Prometheus (the same data Grafana visualises), rendered
 * natively in the design system. The parent polls every few seconds, so the
 * lines move on their own.
 *
 *   1. Requests/s (area)        2. p95 latency, ms (area)
 *   3. Requests by service      4. Requests by status class (stacked)
 *
 * Animation is disabled on the series so each poll shifts the line in place
 * instead of re-drawing from zero (which would flash).
 */
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from '@/i18n';
import type { LiveMetrics, LiveSeries } from '@/api/endpoints/reporting';

const PALETTE = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];
const GRID = 'var(--border)';
const TICK = { fontSize: 10, fill: 'var(--muted-foreground)' } as const;
// Status classes get semantic colours: ok / client-error / server-error.
const CLASS_COLOR: Record<string, string> = {
  '2xx': 'var(--chart-2)',
  '3xx': 'var(--chart-3)',
  '4xx': 'var(--chart-3)',
  '5xx': 'var(--chart-5)',
};

function timeFmt(t: number): string {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}
function num(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  if (Number.isInteger(v)) return `${v}`;
  return v < 10 ? v.toFixed(2) : v.toFixed(0);
}

interface TipPayload {
  dataKey: string;
  value: number;
  color: string;
}
function TipBody({
  time,
  rows,
  unit,
}: {
  time: number;
  rows: TipPayload[];
  unit: string;
}) {
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <div className="mb-0.5 font-medium text-foreground tabular-nums">
        {timeFmt(time)}
      </div>
      {rows.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span
            className="h-2 w-2 flex-none rounded-full"
            style={{ background: p.color }}
          />
          {p.dataKey !== 'value' && <span className="truncate">{p.dataKey}</span>}
          <span className="ml-auto tabular-nums text-foreground">
            {num(p.value)}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tip = (unit = '') => (props: any) =>
  props.active && props.payload?.length ? (
    <TipBody time={props.label} rows={props.payload} unit={unit} />
  ) : null;

function Empty() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
      {t('live_metrics.empty')}
    </div>
  );
}

// recharts discovers axis/grid children via React.Children (flattens arrays
// but NOT fragments) — so this returns a keyed array, never a <>fragment</>.
const axes = () => [
  <CartesianGrid key="g" stroke={GRID} strokeDasharray="3 3" vertical={false} />,
  <XAxis
    key="x"
    dataKey="t"
    tickFormatter={timeFmt}
    tick={TICK}
    axisLine={false}
    tickLine={false}
    minTickGap={40}
  />,
  <YAxis
    key="y"
    width={34}
    tick={TICK}
    axisLine={false}
    tickLine={false}
    tickFormatter={num}
    allowDecimals={false}
  />,
];
const MARGIN = { top: 6, right: 8, left: -10, bottom: 0 } as const;

function SingleArea({
  series,
  color,
  id,
  unit,
}: {
  series?: LiveSeries;
  color: string;
  id: string;
  unit?: string;
}) {
  if (!series || series.rows.length === 0) return <Empty />;
  return (
    <ResponsiveContainer>
      <AreaChart data={series.rows} margin={MARGIN}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {axes()}
        <Tooltip content={tip(unit)} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MultiLine({ series }: { series?: LiveSeries }) {
  if (!series || series.rows.length === 0 || series.keys.length === 0)
    return <Empty />;
  return (
    <ResponsiveContainer>
      <LineChart data={series.rows} margin={MARGIN}>
        {axes()}
        <Tooltip content={tip()} />
        {series.keys.map((k, i) => (
          <Line
            key={k}
            type="monotone"
            dataKey={k}
            stroke={PALETTE[i % PALETTE.length]}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function StackedArea({ series }: { series?: LiveSeries }) {
  if (!series || series.rows.length === 0 || series.keys.length === 0)
    return <Empty />;
  return (
    <ResponsiveContainer>
      <AreaChart data={series.rows} margin={MARGIN}>
        {axes()}
        <Tooltip content={tip()} />
        {series.keys.map((k, i) => {
          const c = CLASS_COLOR[k] ?? PALETTE[i % PALETTE.length];
          return (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="1"
              stroke={c}
              fill={c}
              fillOpacity={0.4}
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function LiveCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-foreground">{title}</div>
            {subtitle && (
              <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
          {right}
        </div>
        <div className="h-40 w-full">{children}</div>
      </CardContent>
    </Card>
  );
}

function lastValue(series?: LiveSeries, key = 'value'): number {
  if (!series || series.rows.length === 0) return 0;
  const v = series.rows[series.rows.length - 1][key];
  return typeof v === 'number' ? v : 0;
}

interface Props {
  data?: LiveMetrics;
  loading?: boolean;
}

export function LiveMetricsCharts({ data, loading }: Props) {
  const { t } = useTranslation();
  const c = data?.charts;

  if (loading && !data) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('live_metrics.heading')}</h2>
        <div className="flex items-center gap-3">
          <span className="tabular-nums text-xs text-muted-foreground">
            {t('live_metrics.services', {
              online: data?.services_online ?? 0,
              total: data?.services_total ?? 0,
            })}
          </span>
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t('live_metrics.live')}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <LiveCard
          title={t('live_metrics.rps')}
          subtitle={t('live_metrics.rps_sub')}
          right={
            <span className="text-lg font-semibold tabular-nums">
              {num(lastValue(c?.rps))}
            </span>
          }
        >
          <SingleArea series={c?.rps} color={PALETTE[0]} id="lm-rps" />
        </LiveCard>

        <LiveCard
          title={t('live_metrics.latency')}
          subtitle={t('live_metrics.latency_sub')}
          right={
            <span className="text-lg font-semibold tabular-nums">
              {num(lastValue(c?.latency))} ms
            </span>
          }
        >
          <SingleArea series={c?.latency} color={PALETTE[1]} id="lm-lat" unit=" ms" />
        </LiveCard>

        <LiveCard
          title={t('live_metrics.by_service')}
          subtitle={t('live_metrics.by_service_sub')}
        >
          <MultiLine series={c?.by_service} />
        </LiveCard>

        <LiveCard
          title={t('live_metrics.by_class')}
          subtitle={t('live_metrics.by_class_sub')}
        >
          <StackedArea series={c?.by_class} />
        </LiveCard>
      </div>
    </section>
  );
}

export default LiveMetricsCharts;
