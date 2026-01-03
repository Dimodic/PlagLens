/**
 * KPICard — small "stat at a glance" card for dashboards.
 */
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';

export interface KPICardProps {
  label: string;
  value: number | string | null | undefined;
  hint?: string;
  icon?: ReactNode;
  /** Tone signal: brand (default), warn, danger, accent. Maps to text color. */
  color?: 'brand' | 'warn' | 'danger' | 'accent' | 'blue' | 'grape' | 'green' | 'red' | 'orange';
  loading?: boolean;
  testId?: string;
}

function formatValue(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (Number.isFinite(v)) {
      if (Math.abs(v) >= 1000)
        return v.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
      return Number.isInteger(v) ? String(v) : v.toFixed(2);
    }
    return '—';
  }
  return v;
}

function valueToneClass(color: KPICardProps['color']): string {
  switch (color) {
    case 'red':
    case 'danger':
      return 'text-sev-high';
    case 'orange':
    case 'warn':
      return 'text-sev-mid';
    case 'green':
      return 'text-sev-low';
    case 'blue':
    case 'grape':
    case 'accent':
      return 'text-primary';
    default:
      return 'text-foreground';
  }
}

function iconWrapClass(color: KPICardProps['color']): string {
  switch (color) {
    case 'red':
    case 'danger':
      return 'bg-sev-high-bg text-sev-high';
    case 'orange':
    case 'warn':
      return 'bg-sev-mid-bg text-sev-mid';
    case 'green':
      return 'bg-sev-low-bg text-sev-low';
    case 'blue':
    case 'grape':
    case 'accent':
      return 'bg-primary/10 text-primary';
    default:
      return 'bg-accent text-accent-foreground';
  }
}

export function KPICard({
  label,
  value,
  hint,
  icon,
  color = 'brand',
  loading,
  testId,
}: KPICardProps) {
  return (
    <Card data-testid={testId ?? 'kpi-card'} className="border-border/70">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          {icon && (
            <div
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full',
                iconWrapClass(color),
              )}
            >
              {icon}
            </div>
          )}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-8 w-24" />
        ) : (
          <div
            className={cn(
              'mt-2 text-3xl font-semibold leading-tight tabular',
              valueToneClass(color),
            )}
          >
            {formatValue(value)}
          </div>
        )}
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
