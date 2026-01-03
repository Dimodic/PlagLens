/**
 * StatusPill — minimal outlined pill with a coloured dot.
 *
 * One acceptable status display across the app. Background stays neutral;
 * only the 6-px dot carries the colour.
 *
 *   <StatusPill tone="success">Активна</StatusPill>
 *
 * tone:
 *   success     → emerald-500
 *   warning     → amber-500
 *   destructive → red-500
 *   info        → sky-500
 *   neutral     → slate-400 (default)
 */
import { ReactNode } from 'react';
import { cn } from '@/components/ui/utils';

export type StatusTone =
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'neutral';

const DOT: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-red-500',
  info: 'bg-sky-500',
  neutral: 'bg-slate-400',
};

interface StatusPillProps {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function StatusPill({
  tone = 'neutral',
  children,
  className,
  ...rest
}: StatusPillProps) {
  return (
    <span
      data-testid={rest['data-testid']}
      data-tone={tone}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT[tone])} />
      {children}
    </span>
  );
}

export default StatusPill;
