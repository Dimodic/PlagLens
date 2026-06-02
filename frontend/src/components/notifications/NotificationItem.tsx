/**
 * NotificationItem — single row in inbox / dropdown.
 */
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Info,
} from 'lucide-react';
import dayjs from 'dayjs';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';
import type {
  NotificationItem as NotificationModel,
  NotificationSeverity,
} from '@/api/endpoints/notifications';

const SEVERITY_BORDER: Record<NotificationSeverity, string> = {
  info: 'border-l-primary',
  success: 'border-l-sev-low',
  warning: 'border-l-sev-mid',
  error: 'border-l-sev-high',
};

const SEVERITY_ICON_BG: Record<NotificationSeverity, string> = {
  info: 'bg-primary/15 text-primary',
  success: 'bg-sev-low-bg text-sev-low',
  warning: 'bg-sev-mid-bg text-sev-mid',
  error: 'bg-sev-high-bg text-sev-high',
};

const SEVERITY_ICON: Record<NotificationSeverity, JSX.Element> = {
  info: <Info className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  error: <AlertCircle className="h-4 w-4" />,
};

export interface NotificationItemProps {
  notification: NotificationModel;
  onClick?: (n: NotificationModel) => void;
  onMarkRead?: (id: string) => void;
  onArchive?: (id: string) => void;
  compact?: boolean;
}

export function NotificationItem({
  notification: n,
  onClick,
  onMarkRead,
  onArchive,
  compact,
}: NotificationItemProps) {
  const { t } = useTranslation();
  const severity: NotificationSeverity = n.severity ?? 'info';
  return (
    <div
      data-testid={`notification-item-${n.id}`}
      data-notification-id={n.id}
      data-read={n.read ? 'true' : 'false'}
      // Read-on-hover: moving the pointer over an unread item marks it read
      // (the parent dedupes the call so it fires once).
      onMouseEnter={() => {
        if (!n.read) onMarkRead?.(n.id);
      }}
      className={cn(
        'mb-2 border-l-[3px] pl-2',
        SEVERITY_BORDER[severity],
        n.read && 'opacity-65',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={() => onClick?.(n)}
          aria-label={t('notification_item.open')}
          className="flex-1 min-w-0 text-left rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <div className="flex items-start gap-2">
            <span
              className={cn(
                'inline-flex shrink-0 items-center justify-center rounded-full',
                compact ? 'size-6' : 'size-7',
                SEVERITY_ICON_BG[severity],
              )}
            >
              {SEVERITY_ICON[severity] ?? SEVERITY_ICON.info}
            </span>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span
                className={cn(
                  'text-sm truncate',
                  n.read ? 'font-normal' : 'font-semibold',
                )}
              >
                {n.title}
              </span>
              {!compact && (
                <span className="text-xs text-muted-foreground line-clamp-2">
                  {n.body}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {dayjs(n.created_at).format('DD.MM.YYYY HH:mm')}
              </span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-1">
          {!n.read && onMarkRead && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead(n.id);
                  }}
                  data-testid={`mark-read-${n.id}`}
                  aria-label={t('notification_item.mark_read')}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('notification_item.mark_read')}</TooltipContent>
            </Tooltip>
          )}
          {onArchive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive(n.id);
                  }}
                  data-testid={`archive-${n.id}`}
                  aria-label={t('notification_item.archive')}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('notification_item.archive')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}
