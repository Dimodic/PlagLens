/**
 * NotificationCenterPage — full inbox: tabs Unread / All / Archived.
 *
 * Filters by event_type, severity, period (since).
 * Bulk actions: Mark all read.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonList } from '@/components/common/Skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  useArchiveNotification,
  useMarkAllRead,
  useMarkRead,
  useNotifications,
} from '@/hooks/api/useNotificationsApi';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type {
  NotificationFilter,
  NotificationItem as NotificationModel,
  NotificationSeverity,
} from '@/api/endpoints/notifications';

type Tab = 'unread' | 'all' | 'archived';

const SEVERITY_ALL = '__all__';

export default function NotificationCenterPage() {
  useDocumentTitle('Уведомления');
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('unread');
  const [severity, setSeverity] = useState<NotificationSeverity | undefined>();
  const [eventType, setEventType] = useState('');
  const [since, setSince] = useState('');

  const filter = useMemo<NotificationFilter>(
    () => ({
      limit: 50,
      ...(tab === 'unread'
        ? { unread: true, archived: false }
        : tab === 'archived'
          ? { archived: true }
          : { archived: false }),
      ...(severity ? { severity } : {}),
      ...(eventType ? { event_type: eventType } : {}),
      ...(since ? { since } : {}),
    }),
    [tab, severity, eventType, since],
  );

  const { data, isPending } = useNotifications(filter);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const archive = useArchiveNotification();

  const onClick = (n: NotificationModel) => {
    markRead.mutate([n.id]);
    if (n.action_url) navigate(n.action_url);
  };

  const items = data?.data ?? [];

  return (
    <Page>
      <PageHeader
        title="Уведомления"
        action={
          <>
            <Link
              to="/me/notifications/preferences"
              className="text-sm text-primary hover:underline"
            >
              Настройки
            </Link>
            <Link
              to="/me/notifications/web-push"
              className="text-sm text-primary hover:underline"
            >
              Web Push
            </Link>
            <Button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              data-testid="mark-all-btn"
            >
              {markAll.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Прочитать все
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="unread" data-testid="tab-unread">
            Непрочитанные
          </TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">
            Все
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-archived">
            Архив
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={severity ?? SEVERITY_ALL}
          onValueChange={(v) =>
            setSeverity(v === SEVERITY_ALL ? undefined : (v as NotificationSeverity))
          }
        >
          <SelectTrigger
            className="w-48"
            data-testid="severity-filter"
            aria-label="Важность"
          >
            <SelectValue placeholder="Любая важность" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SEVERITY_ALL}>Любая важность</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Тип события (event_type)"
          value={eventType}
          onChange={(e) => setEventType(e.currentTarget.value)}
          data-testid="event-type-filter"
          className="w-64"
        />
        <Input
          placeholder="С даты (ISO)"
          value={since}
          onChange={(e) => setSince(e.currentTarget.value)}
          data-testid="since-filter"
          className="w-56"
        />
      </div>

      {isPending && items.length === 0 ? (
        <SkeletonList rows={4} rowHeight={56} />
      ) : items.length === 0 ? (
        <EmptyState title="Нет уведомлений" />
      ) : (
        <div className="space-y-0" data-testid="notifications-list">
          {items.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onClick={onClick}
              onMarkRead={(id) => markRead.mutate([id])}
              onArchive={(id) => archive.mutate(id)}
            />
          ))}
          {data?.pagination?.has_more && (
            <p className="mt-4 text-xs text-muted-foreground">
              Есть ещё. Загрузка следующих будет добавлена позже.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}
