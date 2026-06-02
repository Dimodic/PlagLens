/**
 * Shared audit-events table — the canonical row design used by both the main
 * /admin/audit page and the inline audit tab on a tenant's detail page, so the
 * two stay visually identical. Flat hover rows (no card chrome): When · Action
 * (+ resource link) · Actor · Result (tone-coloured).
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { shortId } from '@/utils/formatters';
import { useTranslation } from '@/i18n';
import type { AuditEvent } from '@/api/endpoints/audit';

/** Result/category → text tone, matching the main audit timeline. */
export function eventToneClass(e: AuditEvent): string {
  if (e.result === 'failure') return 'text-sev-high';
  if (e.action.startsWith('llm.') || e.action.startsWith('ai.')) {
    return 'text-primary';
  }
  if (e.action.startsWith('config.') || e.action.startsWith('integration.')) {
    return 'text-foreground';
  }
  return 'text-muted-foreground';
}

export function AuditEventsTable({ events }: { events: AuditEvent[] }) {
  const { t } = useTranslation();
  return (
    <div className="border-y">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">
              {t('audit_events.col_when')}
            </TableHead>
            <TableHead>{t('audit_events.col_action')}</TableHead>
            <TableHead>{t('audit_events.col_actor')}</TableHead>
            <TableHead className="w-[100px] text-right">
              {t('audit_events.col_result')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((e) => {
            const tone = eventToneClass(e);
            return (
              <TableRow
                key={e.id}
                data-testid={`audit-row-${e.id}`}
                className="border-b-0 transition-colors hover:bg-muted/40"
              >
                <TableCell>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {dayjs(e.occurred_at).fromNow()}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-sm font-medium text-foreground">
                    {e.action}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {e.resource.id ? (
                      <Link
                        to={`/admin/audit/resources/${e.resource.type}/${e.resource.id}`}
                        data-testid={`audit-resource-link-${e.id}`}
                        className="hover:text-foreground hover:underline"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {e.resource.type} · {shortId(e.resource.id)}
                      </Link>
                    ) : (
                      e.resource.type
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground">
                    {e.actor.id ? (
                      <Link
                        to={`/admin/audit/actors/${e.actor.id}`}
                        data-testid={`audit-actor-link-${e.id}`}
                        className="hover:text-foreground hover:underline"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        {e.actor.display_name ?? shortId(e.actor.id)}
                      </Link>
                    ) : (
                      e.actor.display_name ?? e.actor.type
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className={`text-xs font-medium ${tone}`}>{e.result}</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default AuditEventsTable;
