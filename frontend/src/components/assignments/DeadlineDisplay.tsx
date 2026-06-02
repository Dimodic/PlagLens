/**
 * Compact display of soft + hard deadlines with relative coloring.
 */
import { Clock } from 'lucide-react';
import dayjs from 'dayjs';
import { formatDateTime } from '@/utils/formatters';
import { useTranslation } from '@/i18n';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface DeadlineDisplayProps {
  softAt: string | null;
  hardAt: string | null;
  size?: 'xs' | 'sm';
}

function classForDeadline(at: string | null, kind: 'soft' | 'hard'): string {
  if (!at) return 'text-muted-foreground';
  const diff = dayjs(at).diff(dayjs(), 'hour');
  if (diff < 0) return kind === 'hard' ? 'text-sev-high' : 'text-sev-mid';
  if (diff < 24) return kind === 'hard' ? 'text-sev-high' : 'text-sev-mid';
  if (diff < 24 * 3) return 'text-sev-mid';
  return 'text-muted-foreground';
}

export function DeadlineDisplay({ softAt, hardAt, size = 'sm' }: DeadlineDisplayProps) {
  const { t } = useTranslation();
  const sizeClass = size === 'xs' ? 'text-xs' : 'text-sm';

  if (!softAt && !hardAt) {
    return <span className={`${sizeClass} text-muted-foreground`}>{t('deadline_display.none')}</span>;
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-3">
        {softAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span className={`${sizeClass} ${classForDeadline(softAt, 'soft')}`}>
                  {formatDateTime(softAt)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t('deadline_display.soft')}</TooltipContent>
          </Tooltip>
        )}
        {hardAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span
                  className={`${sizeClass} font-medium ${classForDeadline(hardAt, 'hard')}`}
                >
                  {formatDateTime(hardAt)}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{t('deadline_display.hard')}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
