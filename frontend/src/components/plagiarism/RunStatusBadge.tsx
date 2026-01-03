/**
 * Coloured status badge for a PlagiarismRun.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/components/ui/utils';
import type { RunStatus } from '@/api/endpoints/plagiarism';

const CLASS: Record<RunStatus, string> = {
  queued: 'bg-muted text-muted-foreground hover:bg-muted',
  running: 'bg-primary/10 text-primary hover:bg-primary/10',
  completed: 'bg-sev-low-bg text-sev-low hover:bg-sev-low-bg',
  failed: 'bg-sev-high-bg text-sev-high hover:bg-sev-high-bg',
  cancelled: 'bg-sev-mid-bg text-sev-mid hover:bg-sev-mid-bg',
};

const LABEL: Record<RunStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

interface RunStatusBadgeProps {
  status: RunStatus;
}

export function RunStatusBadge({ status }: RunStatusBadgeProps) {
  return (
    <Badge variant="secondary" className={cn('font-normal', CLASS[status])}>
      {LABEL[status]}
    </Badge>
  );
}

export default RunStatusBadge;
