/**
 * Coloured Risk Signal badge.
 */
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { RiskSeverity, RiskSignalType } from '@/api/endpoints/ai';

export const RISK_TYPE_LABEL: Record<RiskSignalType, string> = {
  style_jump: 'Скачок стиля',
  generic_solution: 'Шаблонное решение',
  non_idiomatic: 'Не-идиоматичный код',
  complexity_jump: 'Скачок сложности',
  library_misuse: 'Странное использование библиотек',
  stub_code: 'Заглушка / пустой код',
  other: 'Прочее',
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
  const label = `${RISK_TYPE_LABEL[type] ?? type} • ${SEVERITY_LABEL[severity]}`;
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
