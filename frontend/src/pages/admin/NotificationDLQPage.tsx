/**
 * /admin/notifications/dlq — failed deliveries with retry/discard.
 */
import dayjs from 'dayjs';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDLQ,
  useDiscardDelivery,
  useRetryDelivery,
} from '@/hooks/api/useNotificationsAdmin';
import type { Problem } from '@/api/types';

export function NotificationDLQPage() {
  const { t } = useTranslation();
  useDocumentTitle('Notifications DLQ');
  const notify = useNotifications();
  const { data, isLoading, error, refetch } = useDLQ({ limit: 100 });
  const retryM = useRetryDelivery();
  const discardM = useDiscardDelivery();

  const handleRetry = async (id: string) => {
    try {
      await retryM.mutateAsync(id);
      notify.success(t('notif_dlq.retry_success'));
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('notif_dlq.action_failed'));
    }
  };

  const handleDiscard = async (id: string) => {
    try {
      await discardM.mutateAsync(id);
      notify.success(t('notif_dlq.discard_success'));
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('notif_dlq.action_failed'));
    }
  };

  return (
    <Page width="wide">
      <PageHeader title="Notifications DLQ" />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title={t('notif_dlq.empty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Failure</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>{t('notif_dlq.col_time')}</TableHead>
                  <TableHead>{t('notif_dlq.col_actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((d) => (
                  <TableRow key={d.id} data-testid={`dlq-row-${d.id}`}>
                    <TableCell>
                      <StatusPill tone="neutral">{d.channel}</StatusPill>
                    </TableCell>
                    <TableCell>{d.recipient}</TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {d.event_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block max-w-[300px] truncate text-xs text-destructive">
                        {d.failure_reason ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>{d.attempts}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {dayjs(d.enqueued_at).format('DD.MM HH:mm')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(d.id)}
                          disabled={retryM.isPending}
                        >
                          {retryM.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDiscard(d.id)}
                          disabled={discardM.isPending}
                          className="text-destructive hover:text-destructive"
                        >
                          {discardM.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                          )}
                          Discard
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </Page>
  );
}

export default NotificationDLQPage;
