/**
 * Coloured Risk Signal badge.
 */
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from '@/i18n';
import type { RiskSeverity, RiskSignalType } from '@/api/endpoints/ai';

export const RISK_TYPE_KEY: Record<RiskSignalType, string> = {
  style_jump: 'risk_signal_badge.type.style_jump',
  generic_solution: 'risk_signal_badge.type.generic_solution',
  non_idiomatic: 'risk_signal_badge.type.non_idiomatic',
  complexity_jump: 'risk_signal_badge.type.complexity_jump',
  library_misuse: 'risk_signal_badge.type.library_misuse',
  stub_code: 'risk_signal_badge.type.stub_code',
  other: 'risk_signal_badge.type.other',
};

const SEVERITY_CLASSES: Record<RiskSeverity, string> = {
  low: 'bg-sev-low-bg text-sev-low border-transparent',
  medium: 'bg-sev-mid-bg text-sev-mid border-transparent',
  high: 'bg-sev-high-bg text-sev-high border-transparent',
};

const SEVERITY_LABEL: Record<RiskSeverity, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
};

interface RiskSignalBadgeProps {
  type: RiskSignalType;
  severity: RiskSeverity;
  details?: string;
}

export function RiskSignalBadge({ type, severity, details }: RiskSignalBadgeProps) {
  const { t } = useTranslation();
  const typeLabel = RISK_TYPE_KEY[type] ? t(RISK_TYPE_KEY[type]) : type;
  const label = `${typeLabel} • ${SEVERITY_LABEL[severity]}`;
  const badge = (
    <Badge
      variant="outline"
      className={`font-normal normal-case ${SEVERITY_CLASSES[severity]}`}
    >
      {label}
    </Badge>
  );
  if (!details) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] whitespace-pre-wrap">
        {details}
      </TooltipContent>
    </Tooltip>
  );
}

export default RiskSignalBadge;
