/**
 * EmptyState — minimal: icon + one line + (optional) one button.
 *
 * No advisory paragraphs, no "тут будут появляться…" prose. Per the
 * minimalism principle, we give a tool, not an explanation.
 */
import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/components/ui/utils';

interface EmptyStateProps {
  /** Single short line shown in muted text. Required. */
  title?: string;
  /** Backwards-compat alias for `title`. */
  message?: string;
  /** Backwards-compat: ignored; kept so old call sites compile. */
  description?: string;
  /** Optional icon (defaults to Inbox @ size-12). */
  icon?: ReactNode;
  /** Optional primary action — render a single <Button>. */
  action?: ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  const line = title ?? message ?? 'Пусто';
  return (
    <div
      data-testid={rest['data-testid']}
      className={cn(
        'flex flex-col items-center justify-center py-16 px-6 text-center',
        className,
      )}
    >
      <div className="mb-3 text-muted-foreground">
        {icon ?? <Inbox className="size-12" />}
      </div>
      <p className="text-sm text-muted-foreground">{line}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
