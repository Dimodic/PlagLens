/**
 * /admin/audit/search — POST search with text query, filters and aggregation chart.
 */
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { AuditEventCard } from '@/components/admin/AuditEventCard';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useAuditSearch } from '@/hooks/api/useAudit';
import type { AuditAggregation } from '@/api/endpoints/audit';
import type { Problem } from '@/api/types';

interface BarChartProps {
  data: Array<{ key: string; count: number }>;
}

/** Lightweight bar chart implementation — no extra deps. */
function BarChart({ data }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex flex-col gap-1">
      {data.map((d) => (
        <div key={d.key} className="flex items-center gap-2">
          <div
            className="min-w-[200px] truncate text-xs font-mono"
            title={d.key}
          >
            {d.key}
          </div>
          <div className="relative h-[18px] flex-1">
            <div
              data-testid={`bar-${d.key}`}
              className="absolute left-0 top-0 h-full rounded-sm bg-primary"
              style={{ width: `${(d.count / max) * 100}%` }}
            />
          </div>
          <div className="min-w-[40px] text-right text-xs">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

export function AuditSearchPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('audit_search.title'));
  const search = useAuditSearch();

  const [q, setQ] = useState('');
  const [actorId, setActorId] = useState('');
  const [aggByAction, setAggByAction] = useState(true);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [aggregations, setAggregations] = useState<AuditAggregation[]>([]);

  const handleSearch = async () => {
    setProblem(null);
    setAggregations([]);
    try {
      const r = await search.mutateAsync({
        q: q || undefined,
        filters: actorId ? { actor_id: actorId } : undefined,
        aggregations: aggByAction ? [{ type: 'count', by: 'action' }] : undefined,
      });
      setAggregations(r.aggregations ?? []);
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <Page width="wide">
      <PageHeader title={t('audit_search.title')} />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-q">{t('audit_search.query_label')}</Label>
            <Input
              id="audit-q"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
              data-testid="audit-search-q-input"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-actor">actor_id</Label>
            <Input
              id="audit-actor"
              value={actorId}
              onChange={(e) => setActorId(e.currentTarget.value)}
              data-testid="audit-search-actor-input"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="audit-agg"
              checked={aggByAction}
              onCheckedChange={(v) => setAggByAction(v)}
              data-testid="audit-search-agg-toggle"
            />
            <Label htmlFor="audit-agg">{t('audit_search.agg_toggle_label')}</Label>
          </div>
          <div className="flex items-center justify-end">
            <Button
              onClick={handleSearch}
              disabled={search.isPending}
              data-testid="audit-search-submit"
            >
              {search.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('audit_search.search')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {problem && <ProblemAlert problem={problem} />}

      {search.isPending && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {aggregations.length > 0 && (
        <Card data-testid="audit-aggregations-card">
          <CardContent className="p-6">
            <h2 className="mb-3 text-base font-semibold tracking-tight">{t('audit_search.aggregations')}</h2>
            {aggregations.map((a) => (
              <div key={a.by} className="mb-3 space-y-2">
                <h3 className="text-sm font-medium">{t('audit_search.agg_by', { field: a.by })}</h3>
                <BarChart data={a.values} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {search.data && search.data.data.length > 0 && (
        <div className="space-y-3">
          {search.data.data.map((e) => (
            <AuditEventCard key={e.id} event={e} />
          ))}
        </div>
      )}
    </Page>
  );
}

export default AuditSearchPage;
