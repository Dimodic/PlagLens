/**
 * Visualizer for an async Operation. Polls until terminal.
 */
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/components/ui/utils';
import { useOperation } from '@/api/operation';
import { useTranslation } from '@/i18n';
import type { OperationStatus } from '@/api/types';

const STATUS_CLASS: Record<OperationStatus, string> = {
  queued: 'bg-muted text-muted-foreground hover:bg-muted',
  running: 'bg-primary/10 text-primary hover:bg-primary/10',
  completed: 'bg-sev-low-bg text-sev-low hover:bg-sev-low-bg',
  failed: 'bg-sev-high-bg text-sev-high hover:bg-sev-high-bg',
  cancelled: 'bg-sev-mid-bg text-sev-mid hover:bg-sev-mid-bg',
};

interface AsyncOperationStatusProps {
  operationId: string | null;
  onComplete?: () => void;
}

export function AsyncOperationStatus({
  operationId,
  onComplete,
}: AsyncOperationStatusProps) {
  const { t } = useTranslation();
  const { operation } = useOperation(operationId, {
    onComplete: () => onComplete?.(),
  });

  if (!operationId) return null;
  if (!operation) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('async_operation_status.starting')}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{operation.kind}</span>
        <Badge
          variant="secondary"
          className={cn('font-normal', STATUS_CLASS[operation.status])}
        >
          {t(`async_operation_status.status_${operation.status}`)}
        </Badge>
      </div>
      {operation.progress && operation.status !== 'completed' && (
        <Progress value={operation.progress.percent} />
      )}
      {operation.error && (
        <p className="text-sm text-destructive">{operation.error.title}</p>
      )}
    </div>
  );
}
