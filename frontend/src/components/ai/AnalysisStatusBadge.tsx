/**
 * Coloured status badge for an AI Analysis.
 */
import { Badge } from '@/components/ui/badge';
import type { AnalysisStatus } from '@/api/endpoints/ai';

const CLASSES: Record<AnalysisStatus, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-sev-low-bg text-sev-low border-transparent',
  completed: 'bg-accent text-accent-foreground border-transparent',
  failed: 'bg-sev-high-bg text-sev-high border-transparent',
  cancelled: 'bg-sev-mid-bg text-sev-mid border-transparent',
};

const LABEL: Record<AnalysisStatus, string> = {
  queued: 'В очереди',
  running: 'Анализирует',
  completed: 'Готово',
  failed: 'Ошибка',
  cancelled: 'Отменено',
};

interface AnalysisStatusBadgeProps {
  status: AnalysisStatus;
}

export function AnalysisStatusBadge({ status }: AnalysisStatusBadgeProps) {
  return (
    <Badge variant="outline" className={`font-normal ${CLASSES[status]}`}>
      {LABEL[status]}
    </Badge>
  );
}

export default AnalysisStatusBadge;
