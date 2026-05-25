/**
 * StatsPanel — Kaggle-style horizontal KPI strip.
 *
 * Replaces a "grid of stat cards" with a single horizontal row separated by
 * vertical rules, framed top + bottom by hairline borders. No card chrome.
 *
 *   <StatsPanel
 *     items={[
 *       { icon: <Icon />, label: 'Курсы', value: 12, hint: 'всего активных' },
 *       ...
 *     ]}
 *   />
 */
import { ReactNode } from 'react';
import { cn } from '@/components/ui/utils';

export interface StatsPanelItem {
  icon?: ReactNode;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Native tooltip shown on hover over the cell — for acronyms like DAU/MAU. */
  tooltip?: string;
}

interface StatsPanelProps {
  items: StatsPanelItem[];
  className?: string;
  'data-testid'?: string;
}

export function StatsPanel({
  items,
  className,
  ...rest
}: StatsPanelProps) {
  if (items.length === 0) return null;
  return (
    <div
      data-testid={rest['data-testid'] ?? 'stats-panel'}
      className={cn(
        'flex flex-wrap divide-x divide-border/50 border-y border-border/50 py-6',
        className,
      )}
    >
      {items.map((it, i) => (
        <div
          key={i}
          title={it.tooltip}
          className={cn(
            'flex-1 min-w-[160px] px-6 first:pl-0 last:pr-0',
            it.tooltip && 'cursor-help',
          )}
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {it.icon && <span className="size-4 shrink-0">{it.icon}</span>}
            <span>{it.label}</span>
          </div>
          <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
            {it.value}
          </div>
          {it.hint && (
            <div className="text-xs text-muted-foreground">{it.hint}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default StatsPanel;
