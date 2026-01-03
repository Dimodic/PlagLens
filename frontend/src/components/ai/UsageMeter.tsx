/**
 * Coloured progress bar for AI budget usage.
 */
import { Progress } from '@/components/ui/progress';
import { CostFormatter } from './CostFormatter';

interface UsageMeterProps {
  /** Used amount (tokens or cost). */
  used: number;
  /** Max allowed (null = no limit). */
  max: number | null;
  /** Soft warning fraction, default 0.8. */
  softWarnAt?: number;
  /** Display unit. */
  unit?: 'tokens' | 'cost';
  label?: string;
}

function fmtTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function UsageMeter({
  used,
  max,
  softWarnAt = 0.8,
  unit = 'tokens',
  label,
}: UsageMeterProps) {
  if (max == null) {
    return (
      <div className="flex flex-col gap-1">
        {label && <div className="text-sm font-medium">{label}</div>}
        <div className="text-sm text-muted-foreground">
          {unit === 'cost' ? <CostFormatter value={used} /> : fmtTokens(used)} (без лимита)
        </div>
      </div>
    );
  }
  const ratio = max > 0 ? Math.min(1, used / max) : 0;

  const stateLabel: 'ok' | 'warn' | 'exceeded' =
    ratio >= 1 ? 'exceeded' : ratio >= softWarnAt ? 'warn' : 'ok';

  const textColorClass =
    stateLabel === 'exceeded'
      ? 'text-sev-high'
      : stateLabel === 'warn'
        ? 'text-sev-mid'
        : 'text-sev-low';
  const indicatorColorClass =
    stateLabel === 'exceeded'
      ? '[&>[data-slot=progress-indicator]]:bg-sev-high'
      : stateLabel === 'warn'
        ? '[&>[data-slot=progress-indicator]]:bg-sev-mid'
        : '[&>[data-slot=progress-indicator]]:bg-sev-low';

  return (
    <div
      className="flex flex-col gap-1"
      aria-label="usage-meter"
      data-testid={`usage-meter-${unit}`}
      data-state={stateLabel}
    >
      {label && <div className="text-sm font-medium">{label}</div>}
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {unit === 'cost' ? (
            <>
              <CostFormatter value={used} /> / <CostFormatter value={max} />
            </>
          ) : (
            <>
              {fmtTokens(used)} / {fmtTokens(max)}
            </>
          )}
        </div>
        <div
          className={`text-xs font-semibold ${textColorClass}`}
          data-testid={`usage-meter-${unit}-pct`}
        >
          {(ratio * 100).toFixed(1)}%
        </div>
      </div>
      <Progress value={ratio * 100} className={indicatorColorClass} />
    </div>
  );
}

export default UsageMeter;
