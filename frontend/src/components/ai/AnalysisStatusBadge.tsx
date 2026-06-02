/**
 * Coloured status badge for an AI Analysis.
 */
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/i18n';
import type { AnalysisStatus } from '@/api/endpoints/ai';

const CLASSES: Record<AnalysisStatus, string> = {
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-sev-low-bg text-sev-low border-transparent',
  completed: 'bg-accent text-accent-foreground border-transparent',
  failed: 'bg-sev-high-bg text-sev-high border-transparent',
  cancelled: 'bg-sev-mid-bg text-sev-mid border-transparent',
};

const LABEL_KEY: Record<AnalysisStatus, string> = {
  queued: 'analysis_status_badge.queued',
  running: 'analysis_status_badge.running',
  completed: 'analysis_status_badge.completed',
  failed: 'analysis_status_badge.failed',
  cancelled: 'analysis_status_badge.cancelled',
};

interface AnalysisStatusBadgeProps {
  status: AnalysisStatus;
}

export function AnalysisStatusBadge({ status }: AnalysisStatusBadgeProps) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={`font-normal ${CLASSES[status]}`}>
      {t(LABEL_KEY[status])}
    </Badge>
  );
}

export default AnalysisStatusBadge;
