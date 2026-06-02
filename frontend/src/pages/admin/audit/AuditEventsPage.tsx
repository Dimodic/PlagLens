/**
 * /admin/audit — audit timeline with filters.
 *
 * Filter row + table-style timeline of events. Backend filters preserved
 * (actor_id, action, resource_type, result). Test ids unchanged.
 */
import { useState } from 'react';
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
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { AuditEventsTable } from '@/components/admin/AuditEventsTable';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import { useAuditEvents, useExportAuditCsv } from '@/hooks/api/useAudit';
import type { AuditFilters } from '@/api/endpoints/audit';
import type { Problem } from '@/api/types';

export function AuditEventsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('audit_events.title'));
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
        t('audit_events.export_started', { id: handle.operation_id }),
        t('audit_events.export_csv'),
      );
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('audit_events.export_failed'));
    }
  };

  return (
    <Page width="wide">
      <PageHeader
        title={t('audit_events.title')}
        action={
          <Button
            variant="outline"
            onClick={handleExport}
            data-testid="audit-export-csv"
            disabled={exportCsv.isPending}
          >
            <ExternalLinkIcon className="mr-2 h-4 w-4" />
            {exportCsv.isPending
              ? t('audit_events.exporting')
              : t('audit_events.export_csv')}
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
          placeholder={t('audit_events.action_placeholder')}
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
            <SelectItem value="all">{t('audit_events.result_all')}</SelectItem>
            <SelectItem value="success">success</SelectItem>
            <SelectItem value="failure">failure</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button onClick={apply} data-testid="audit-apply-filters">
            {t('audit_events.apply')}
          </Button>
          <Button
            variant="ghost"
            onClick={reset}
            data-testid="audit-reset-filters"
          >
            {t('audit_events.reset')}
          </Button>
        </div>
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isPending && !data ? (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('skeleton.aria_label')}
          className="border-y"
        >
          {/* Header bar — mirrors the 4-column TableHeader (h-10). */}
          <div className="flex h-10 items-center gap-4 border-b px-2">
            <Skeleton className="h-3 w-[120px] rounded bg-muted/40" />
            <Skeleton className="h-3 w-24 rounded bg-muted/40" />
            <Skeleton className="ml-auto h-3 w-20 rounded bg-muted/40" />
            <Skeleton className="h-3 w-[100px] rounded bg-muted/40" />
          </div>
          {/* Rows — narrow «when», 2-line action, actor, right-aligned result. */}
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 border-b px-2 py-3 last:border-0"
            >
              <Skeleton className="h-3 w-[120px] rounded bg-muted/40" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/2 rounded bg-muted/40" />
                <Skeleton className="h-3 w-1/3 rounded bg-muted/30" />
              </div>
              <Skeleton className="h-3 w-24 rounded bg-muted/30" />
              <Skeleton className="h-3 w-[60px] rounded bg-muted/40" />
            </div>
          ))}
        </div>
      ) : data && data.data.length === 0 ? (
        <EmptyState title={t('audit_events.empty')} />
      ) : (
        <AuditEventsTable events={data?.data ?? []} />
      )}
    </Page>
  );
}

export default AuditEventsPage;
