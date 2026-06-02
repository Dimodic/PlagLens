/**
 * /notifications — flat feed.
 *
 * Previous iteration had unread/all/archived tabs, severity dropdown,
 * event_type / since(ISO) filters and a "Web Push" link in the header.
 * The user called it out as ops-tooling masquerading as a user page —
 * "это же для пользователя сделано". So:
 *
 *   - No tabs, no filters. One scrollable list of everything.
 *   - Unread rows are bolder, read rows fade. A small dot on the left
 *     marks unread visually; no severity badges either (the in-app
 *     events we surface to end users are all "info").
 *   - Single header action: "Прочитать все".
 *   - Click row → mark read + navigate to action_url if any.
 *   - Per-row archive button hidden in hover (kept so the user can
 *     prune the list without exposing yet another tab for it).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Archive, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  useArchiveNotification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from '@/hooks/api/useNotificationsApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { cn } from '@/components/ui/utils';
import type {
  NotificationFilter,
  NotificationItem as NotificationModel,
} from '@/api/endpoints/notifications';

export default function NotificationCenterPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('notification_center.title'));
  const navigate = useNavigate();

  // No filters — just "everything that's not archived", newest first.
  const filter = useMemo<NotificationFilter>(
    () => ({ limit: 100, archived: false }),
    [],
  );

  const { data, isPending } = useNotifications(filter);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const archive = useArchiveNotification();

  const items = data?.data ?? [];

  // Auto-mark every unread row as read when the feed mounts. Coming to
  // /notifications is the user's explicit "I've seen this list" gesture,
  // so we don't need a separate button for the common case. The bulk
  // call only fires once per mount.
  const autoReadRef = useRef(false);
  useEffect(() => {
    if (autoReadRef.current) return;
    if (isPending) return;
    const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) {
      autoReadRef.current = true;
      return;
    }
    autoReadRef.current = true;
    markRead.mutate(unreadIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPending, items.length]);

  const onClick = (n: NotificationModel) => {
    if (!n.read) markRead.mutate([n.id]);
    if (n.action_url) navigate(n.action_url);
  };

  return (
    <Page>
      <PageHeader
        title={t('notification_center.title')}
        action={
          items.some((n) => !n.read) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              data-testid="mark-all-btn"
            >
              {markAll.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {t('notification_center.mark_all_read')}
            </Button>
          ) : null
        }
      />

      {isPending && items.length === 0 ? (
        <FeedSkeleton />
      ) : items.length === 0 ? (
        <EmptyState title={t('notification_center.empty')} />
      ) : (
        <ul
          className="-mx-2 divide-y divide-border/40"
          data-testid="notifications-list"
        >
          {items.map((n) => (
            <FeedRow
              key={n.id}
              notification={n}
              onClick={() => onClick(n)}
              onArchive={() => archive.mutate(n.id)}
            />
          ))}
          {data?.pagination?.has_more && (
            <li className="px-2 pt-4 text-xs text-muted-foreground">
              {t('notification_center.list_truncated')}
            </li>
          )}
        </ul>
      )}
    </Page>
  );
}

/** Loading state — mirrors the real feed: the same `-mx-2 divide-y` list
 *  shell, and per-row a 6px dot slot + stacked title / body / timestamp
 *  lines at `px-2 py-3`. Quiet `bg-muted/*` tone; widths vary per row and
 *  only some rows carry a body line, like the real notifications. */
function FeedSkeleton() {
  // [hasBody, titleWidth] per placeholder row.
  const rows: Array<[boolean, string]> = [
    [true, 'w-2/3'],
    [false, 'w-1/2'],
    [true, 'w-3/5'],
    [true, 'w-2/5'],
    [false, 'w-1/2'],
  ];
  return (
    <ul
      role="status"
      aria-live="polite"
      className="-mx-2 divide-y divide-border/40"
    >
      {rows.map(([hasBody, titleWidth], i) => (
        <li key={i} className="flex items-start gap-3 px-2 py-3">
          {/* Dot slot — matches the unread marker column. */}
          <Skeleton className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-muted/40" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn('h-3.5 rounded bg-muted/40', titleWidth)} />
            {hasBody && <Skeleton className="h-3 w-4/5 rounded bg-muted/30" />}
            <Skeleton className="h-2.5 w-24 rounded bg-muted/30" />
          </div>
        </li>
      ))}
    </ul>
  );
}

interface FeedRowProps {
  notification: NotificationModel;
  onClick: () => void;
  onArchive: () => void;
}

function FeedRow({ notification: n, onClick, onArchive }: FeedRowProps) {
  const { t } = useTranslation();
  return (
    <li
      data-testid={`notification-item-${n.id}`}
      data-notification-id={n.id}
      data-read={n.read ? 'true' : 'false'}
      className="group relative"
    >
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/50"
      >
        {/* Unread marker — 6px dot. Slot kept even when read so titles
            align cleanly down the column. */}
        <span
          aria-hidden
          className={cn(
            'mt-1.5 h-1.5 w-1.5 flex-none rounded-full',
            n.read ? 'bg-transparent' : 'bg-primary',
          )}
        />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              'truncate text-sm',
              n.read ? 'font-normal text-muted-foreground' : 'font-medium text-foreground',
            )}
          >
            {n.title}
          </div>
          {n.body && n.body !== 'У вас новое уведомление.' && (
            <div
              className={cn(
                'truncate text-xs',
                n.read ? 'text-muted-foreground/70' : 'text-muted-foreground',
              )}
            >
              {n.body}
            </div>
          )}
          <div className="mt-0.5 text-[11px] text-muted-foreground/70">
            {dayjs(n.created_at).format('D MMMM, HH:mm')}
          </div>
        </div>
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={onArchive}
        aria-label={t('notification_center.archive')}
        title={t('notification_center.archive')}
        data-testid={`archive-${n.id}`}
        className="absolute right-1 top-2 size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        <Archive className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}
