/**
 * /admin/audit — audit timeline with filters.
 *
 * Filter row + table-style timeline of events. Backend filters preserved
 * (actor_id, action, resource_type, result). Test ids unchanged.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ExternalLink as ExternalLinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { SkeletonList } from '@/components/common/Skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuditEvents, useExportAuditCsv } from '@/hooks/api/useAudit';
import type { AuditEvent, AuditFilters } from '@/api/endpoints/audit';
import type { Problem } from '@/api/types';

function eventToneClass(e: AuditEvent): string {
  if (e.result === 'failure') return 'text-sev-high';
  if (e.action.startsWith('llm.') || e.action.startsWith('ai.')) {
    return 'text-primary';
  }
  if (e.action.startsWith('config.') || e.action.startsWith('integration.')) {
    return 'text-foreground';
  }
  return 'text-muted-foreground';
}

export function AuditEventsPage() {
  useDocumentTitle('Аудит');
  const notify = useNotifications();
  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 });
  const [draft, setDraft] = useState<AuditFilters>({});

  const { data, isPending, error } = useAuditEvents(filters);
  const exportCsv = useExportAuditCsv();

  const apply = () => setFilters({ ...draft, limit: 50 });
  const reset = () => {
    setDraft({});
    setFilters({ limit: 50 });
  };

  const handleExport = async () => {
    try {
      // Pass currently active filters (without pagination keys).
      const { limit: _l, cursor: _c, ...rest } = filters;
      const handle = await exportCsv.mutateAsync(rest);
      notify.info(
        `Экспорт запущен: ${handle.operation_id}. Файл будет доступен в Reporting Service.`,
        'Экспорт CSV',
      );
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось запустить экспорт');
    }
  };

  return (
    <Page width="wide">
      <PageHeader
        title="Аудит"
        action={
          <Button
            variant="outline"
            onClick={handleExport}
            data-testid="audit-export-csv"
            disabled={exportCsv.isPending}
          >
            <ExternalLinkIcon className="mr-2 h-4 w-4" />
            {exportCsv.isPending ? 'Экспорт…' : 'Экспорт CSV'}
          </Button>
        }
      />

      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="actor_id"
          value={draft.actor_id ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, actor_id: e.currentTarget.value || undefined })
          }
          data-testid="audit-actor-input"
          className="w-[180px]"
        />
        <Input
          placeholder="action (например, submission.created)"
          value={draft.action ?? ''}
          onChange={(e) =>
            setDraft({ ...draft, action: e.currentTarget.value || undefined })
          }
          data-testid="audit-action-input"
          className="w-[280px]"
        />
        <Input
          placeholder="resource_type"
          value={draft.resource_type ?? ''}
          onChange={(e) =>
            setDraft({
              ...draft,
              resource_type: e.currentTarget.value || undefined,
            })
          }
          data-testid="audit-resource-type-input"
          className="w-[180px]"
        />
        <Select
          value={draft.result ?? 'all'}
          onValueChange={(v) =>
            setDraft({
              ...draft,
              result: (v === 'all' ? undefined : v) as
                | 'success'
                | 'failure'
                | undefined,
            })
          }
        >
          <SelectTrigger
            className="w-[140px]"
            data-testid="audit-result-select"
          >
            <SelectValue placeholder="result" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все</SelectItem>
            <SelectItem value="success">success</SelectItem>
            <SelectItem value="failure">failure</SelectItem>
          </SelectContent>
        </Select>

        <Button onClick={apply} data-testid="audit-apply-filters">
          Применить
        </Button>
        <Button
          variant="ghost"
          onClick={reset}
          data-testid="audit-reset-filters"
        >
          Сброс
        </Button>
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isPending && !data ? (
        <SkeletonList rows={5} rowHeight={48} />
      ) : data && data.data.length === 0 ? (
        <EmptyState title="Событий нет" />
      ) : (
        <div className="border-y">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Когда</TableHead>
                  <TableHead>Действие</TableHead>
                  <TableHead>Актор</TableHead>
                  <TableHead className="w-[100px] text-right">
                    Результат
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data ?? []).map((e) => {
                  const tone = eventToneClass(e);
                  return (
                    <TableRow
                      key={e.id}
                      data-testid={`audit-row-${e.id}`}
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
                              {e.resource.type} · {e.resource.id}
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
                              {e.actor.display_name ?? e.actor.id}
                            </Link>
                          ) : (
                            e.actor.display_name ?? e.actor.type
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`text-xs font-medium ${tone}`}
                        >
                          {e.result}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
        </div>
      )}
    </Page>
  );
}

export default AuditEventsPage;
