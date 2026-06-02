/**
 * StatusPill — the one status chip across the app.
 *
 * Same visual language as <RoleBadge>: a soft tinted fill + matching text,
 * no border and no dot. The tone's colour alone carries the meaning, so a
 * green «активен» / red «отключён» read instantly without extra ornament.
 *
 *   <StatusPill tone="success">Активна</StatusPill>
 *
 * tone → colour:
 *   success     → emerald
 *   warning     → amber
 *   destructive → red
 *   info        → sky
 *   neutral     → slate (default)
 */
import { ReactNode } from 'react';
import { cn } from '@/components/ui/utils';

export type StatusTone =
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'neutral';

// Muted fill + dimmed text (dark-mode ~80%) so statuses read as calm hints,
// consistent with <RoleBadge> and the rest of the low-saturation UI.
const TONE: Record<StatusTone, string> = {
  success:
    'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300/80',
  warning:
    'bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300/80',
  destructive:
    'bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-300/80',
  info: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300/80',
  neutral:
    'bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300/80',
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
        'inline-flex w-fit items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export default StatusPill;
