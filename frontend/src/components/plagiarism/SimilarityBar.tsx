/**
 * Coloured similarity bar (0..1).
 * Zones: green <0.4, yellow 0.4..0.7, red >0.7.
 */
import { cn } from '@/components/ui/utils';

export type SimilarityZone = 'low' | 'medium' | 'high';

export function similarityZone(value: number): SimilarityZone {
  if (value > 0.7) return 'high';
  if (value >= 0.4) return 'medium';
  return 'low';
}

/**
 * Backwards-compat: returned a Mantine color name. Now returns a token name
 * that maps to PlagLens severity tokens. Existing callers usually only used
 * this string for theming a sibling element.
 */
export function similarityColor(value: number): string {
  const z = similarityZone(value);
  if (z === 'high') return 'red';
  if (z === 'medium') return 'yellow';
  return 'green';
}

export function similarityPercent(value: number): string {
  if (Number.isNaN(value)) return '—';
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return `${pct.toFixed(1)}%`;
}

interface SimilarityBarProps {
  value: number; // 0..1
  showLabel?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  width?: number | string;
}

const ZONE_BAR: Record<SimilarityZone, string> = {
  low: 'bg-sev-low',
  medium: 'bg-sev-mid',
  high: 'bg-sev-high',
};

const ZONE_TEXT: Record<SimilarityZone, string> = {
  low: 'text-sev-low',
  medium: 'text-sev-mid',
  high: 'text-sev-high',
};

const SIZE_HEIGHT: Record<NonNullable<SimilarityBarProps['size']>, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2',
  lg: 'h-3',
};

export function SimilarityBar({
  value,
  showLabel = true,
  size = 'md',
  width = 160,
}: SimilarityBarProps) {
  const safe = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const zone = similarityZone(safe);
  const widthStyle =
    typeof width === 'number' ? `${width}px` : width;
  return (
    <div
      className="flex items-center gap-2"
      aria-label="similarity"
      data-testid="pair-similarity-bar"
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-full bg-muted',
          SIZE_HEIGHT[size],
        )}
        style={{ width: widthStyle }}
        aria-label="similarity-bar"
        data-similarity-zone={zone}
        role="progressbar"
        aria-valuenow={Math.round(safe * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn('h-full transition-all', ZONE_BAR[zone])}
          style={{ width: `${safe * 100}%` }}
        />
      </div>
      {showLabel && (
        <span
          className={cn(
            'min-w-[56px] text-right text-sm font-semibold',
            ZONE_TEXT[zone],
          )}
          data-testid="pair-similarity-label"
        >
          {similarityPercent(safe)}
        </span>
      )}
    </div>
  );
}

export default SimilarityBar;
