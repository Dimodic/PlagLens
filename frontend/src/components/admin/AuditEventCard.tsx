/**
 * Expandable audit event card with optional before/after diff view.
 */
import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, X } from 'lucide-react';
import dayjs from 'dayjs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { AuditEvent } from '@/api/endpoints/audit';

interface Props {
  event: AuditEvent;
  defaultOpen?: boolean;
}

export function AuditEventCard({ event, defaultOpen = false }: Props) {
  const [opened, setOpened] = useState(defaultOpen);
  const isSuccess = event.result === 'success';
  const ResultIcon = isSuccess ? Check : X;
  const ChevIcon = opened ? ChevronDown : ChevronRight;

  return (
    <Card data-testid={`audit-event-card-${event.id}`}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setOpened((v) => !v)}
              aria-label={opened ? 'свернуть' : 'развернуть'}
              data-testid={`audit-event-toggle-${event.id}`}
            >
              <ChevIcon className="h-4 w-4" />
            </Button>
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium">{event.action}</span>
                <Badge
                  variant="outline"
                  className={
                    isSuccess
                      ? 'bg-sev-low-bg text-sev-low font-normal'
                      : 'bg-sev-high-bg text-sev-high font-normal'
                  }
                >
                  <ResultIcon className="mr-1 h-3 w-3" />
                  {event.result}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  {event.source_service}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                actor:{' '}
                <span className="font-mono">
                  {event.actor.type}/{event.actor.id ?? '—'}
                </span>
                {' • '}
                resource:{' '}
                <span className="font-mono">
                  {event.resource.type}/{event.resource.id ?? '—'}
                </span>
              </div>
            </div>
          </div>
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {dayjs(event.occurred_at).format('DD.MM.YYYY HH:mm:ss')}
          </span>
        </div>

        {opened && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {event.ip && (
                <Badge variant="outline" className="font-normal">
                  IP: {event.ip}
                </Badge>
              )}
              {event.request_id && (
                <Badge variant="outline" className="font-normal">
                  req: {event.request_id}
                </Badge>
              )}
              <Badge variant="outline" className="font-normal">
                retention: {event.retention_class}
              </Badge>
            </div>

            {event.before && (
              <div>
                <div className="mb-1 text-xs font-medium">before</div>
                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                  {JSON.stringify(event.before, null, 2)}
                </pre>
              </div>
            )}
            {event.after && (
              <div>
                <div className="mb-1 text-xs font-medium">after</div>
                <pre className="max-h-60 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                  {JSON.stringify(event.after, null, 2)}
                </pre>
              </div>
            )}
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium">metadata</div>
                <pre className="max-h-50 overflow-auto rounded-md bg-muted p-2 font-mono text-xs">
                  {JSON.stringify(event.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AuditEventCard;
