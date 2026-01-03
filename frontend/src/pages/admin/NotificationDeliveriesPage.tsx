/**
 * /admin/notifications/deliveries — recent delivery log.
 */
import { useState } from 'react';
import dayjs from 'dayjs';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useDeliveries } from '@/hooks/api/useNotificationsAdmin';
import type {
  DeliveryChannel,
  DeliveryStatus,
  NotificationDelivery,
} from '@/api/endpoints/notificationsAdmin';
import type { Problem } from '@/api/types';

const STATUS_TONES: Record<DeliveryStatus, StatusTone> = {
  queued: 'info',
  delivered: 'success',
  failed: 'destructive',
  skipped: 'neutral',
};

export function NotificationDeliveriesPage() {
  useDocumentTitle('Доставка уведомлений');
  const [channel, setChannel] = useState<DeliveryChannel | null>(null);
  const [status, setStatus] = useState<DeliveryStatus | null>(null);
  const [open, setOpen] = useState<NotificationDelivery | null>(null);

  const { data, isLoading, error } = useDeliveries({
    channel: channel ?? undefined,
    status: status ?? undefined,
    limit: 100,
  });

  return (
    <Page width="wide">
      <PageHeader title="Доставки" />

      <div className="flex items-center gap-3">
        <Select
          value={channel ?? 'all'}
          onValueChange={(v) =>
            setChannel(v === 'all' ? null : (v as DeliveryChannel))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все channels</SelectItem>
            <SelectItem value="email">email</SelectItem>
            <SelectItem value="telegram">telegram</SelectItem>
            <SelectItem value="in_app">in_app</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status ?? 'all'}
          onValueChange={(v) =>
            setStatus(v === 'all' ? null : (v as DeliveryStatus))
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="delivered">delivered</SelectItem>
            <SelectItem value="failed">failed</SelectItem>
            <SelectItem value="skipped">skipped</SelectItem>
            <SelectItem value="queued">queued</SelectItem>
          </SelectContent>
        </Select>
        {(channel || status) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setChannel(null);
              setStatus(null);
            }}
          >
            Сбросить
          </Button>
        )}
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title="Доставок не было" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Время</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((d) => (
                  <TableRow
                    key={d.id}
                    data-testid={`delivery-row-${d.id}`}
                    onClick={() => setOpen(d)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {dayjs(d.enqueued_at).format('DD.MM HH:mm:ss')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone="neutral">{d.channel}</StatusPill>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">{d.recipient}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono text-muted-foreground">
                        {d.event_type}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONES[d.status]}>{d.status}</StatusPill>
                    </TableCell>
                    <TableCell>{d.attempts}</TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={open != null} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Детали доставки</DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">ID</p>
                <p className="text-sm font-mono">{open.id}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recipient</p>
                <p className="text-sm">{open.recipient}</p>
              </div>
              {open.failure_reason && (
                <div>
                  <p className="text-xs text-muted-foreground">Failure</p>
                  <p className="text-sm text-destructive">{open.failure_reason}</p>
                </div>
              )}
              {open.delivered_at && (
                <div>
                  <p className="text-xs text-muted-foreground">Delivered at</p>
                  <p className="text-sm">{open.delivered_at}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Page>
  );
}

export default NotificationDeliveriesPage;
