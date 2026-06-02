/**
 * Header bell dropdown — shows unread count badge + recent 10 notifications.
 *
 * The unread count polls every 15s and refetches on tab focus (see
 * useUnreadCount); opening the dropdown also forces a refresh. We don't use
 * SSE: the gateway buffers responses, so a live stream would hang there.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/components/ui/utils';
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
  notificationKeys,
} from '@/hooks/api/useNotificationsApi';
import { useTranslation } from '@/i18n';
import { NotificationItem } from './NotificationItem';
import type { NotificationItem as NotificationModel } from '@/api/endpoints/notifications';

interface NotificationsBellDropdownProps {
  enabled?: boolean;
}

export function NotificationsBellDropdown({
  enabled = true,
}: NotificationsBellDropdownProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unread = 0 } = useUnreadCount({ enabled });
  const filter = useMemo(() => ({ limit: 10, archived: false }), []);
  const { data, isLoading } = useNotifications(filter);
  const markAllRead = useMarkAllRead();
  const markRead = useMarkRead();
  // Dedupe hover-reads so a single unread item fires the mutation once even
  // if the pointer re-enters before the cache refreshes.
  const markedRef = useRef<Set<string>>(new Set());
  const onMarkRead = useCallback(
    (id: string) => {
      if (markedRef.current.has(id)) return;
      markedRef.current.add(id);
      markRead.mutate([id]);
    },
    [markRead],
  );
  const handleClick = useCallback(
    (n: NotificationModel) => {
      setOpened(false);
      if (n.action_url) navigate(n.action_url);
    },
    [navigate],
  );

  const items = data?.data ?? [];
  const showBadge = unread > 0;

  return (
    <Popover
      open={opened}
      onOpenChange={(o) => {
        setOpened(o);
        // Opening the bell forces a fresh fetch so the list is never stale.
        if (o) void qc.invalidateQueries({ queryKey: notificationKeys.all });
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <div
              className="relative inline-flex"
              data-testid="notif-bell"
              data-unread-count={unread}
            >
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('notif_bell.aria_label')}
                data-testid="bell-icon"
              >
                <Bell className="h-5 w-5" />
              </Button>
              {showBadge && (
                <span
                  data-testid="notif-unread-badge"
                  className={cn(
                    'pointer-events-none absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground',
                  )}
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t('notif_bell.tooltip')}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[400px] p-2"
        data-testid="bell-dropdown"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="font-semibold">{t('notif_bell.heading')}</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => markAllRead.mutate()}
                  data-testid="mark-all-read-btn"
                >
                  {t('notif_bell.mark_all_read')}
                </Button>
              )}
            </div>
          </div>
          <Separator />
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                {t('common.loading')}
              </p>
            ) : items.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                {t('notif_bell.empty')}
              </p>
            ) : (
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={handleClick}
                  onMarkRead={onMarkRead}
                  compact
                />
              ))
            )}
          </div>
          <Separator />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setOpened(false);
                navigate('/notifications');
              }}
              data-testid="open-all-link"
              className="text-sm text-primary hover:underline"
            >
              {t('notif_bell.open_all')}
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
