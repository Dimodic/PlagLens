/**
 * Header bell dropdown — shows unread count badge + recent 10 notifications.
 *
 * Wires the SSE stream and pushes new notifications into the React Query
 * cache (so the badge stays in sync without polling).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
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
  useNotifications,
  useUnreadCount,
  notificationKeys,
} from '@/hooks/api/useNotificationsApi';
import { useSSE } from '@/api/sse';
import { NotificationItem } from './NotificationItem';
import type { NotificationItem as NotificationModel } from '@/api/endpoints/notifications';

interface NotificationsBellDropdownProps {
  enabled?: boolean;
}

function showNotificationToast(n: NotificationModel) {
  const description = n.body;
  switch (n.severity) {
    case 'error':
      toast.error(n.title, { description });
      break;
    case 'warning':
      toast.warning(n.title, { description });
      break;
    case 'success':
      toast.success(n.title, { description });
      break;
    default:
      toast(n.title, { description });
  }
}

export function NotificationsBellDropdown({
  enabled = true,
}: NotificationsBellDropdownProps) {
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: unread = 0 } = useUnreadCount({ enabled });
  const filter = useMemo(() => ({ limit: 10, archived: false }), []);
  const { data, isLoading } = useNotifications(filter);
  const markAllRead = useMarkAllRead();
  const { lastNotification, isConnected } = useSSE({ enabled });

  // When a new notification arrives via SSE — show toast + invalidate caches.
  useEffect(() => {
    if (!lastNotification) return;
    showNotificationToast(lastNotification);
    void qc.invalidateQueries({ queryKey: notificationKeys.all });
  }, [lastNotification, qc]);

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
    <Popover open={opened} onOpenChange={setOpened}>
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
                aria-label="Уведомления"
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
        <TooltipContent>Уведомления</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[400px] p-2"
        data-testid="bell-dropdown"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="font-semibold">Уведомления</span>
            <div className="flex items-center gap-1">
              {!isConnected && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>SSE отключён</TooltipContent>
                </Tooltip>
              )}
              {unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => markAllRead.mutate()}
                  data-testid="mark-all-read-btn"
                >
                  Прочитать все
                </Button>
              )}
            </div>
          </div>
          <Separator />
          <div className="max-h-[420px] overflow-y-auto">
            {isLoading ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Загрузка…
              </p>
            ) : items.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                Нет уведомлений.
              </p>
            ) : (
              items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={handleClick}
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
              Открыть все
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
