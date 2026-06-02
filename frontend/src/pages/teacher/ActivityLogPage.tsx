/**
 * ActivityLogPage — quiet timeline view at /activity.
 *
 * A row of segmented filter tabs + an aligned counter, then a 4-column timeline grid:
 *   [time] [dot] [description / meta] [actor]
 *
 * Audit events come from `useAuditEvents` (the existing /v1/audit/events
 * cursor-paginated endpoint). Events are mapped to one of the design buckets:
 * Run / Import / Verdict / LLM. The bucket dictates filter membership and the
 * dot tone — which is widened to red for "failure" results.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import { useAuditEvents } from '@/hooks/api/useAudit';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { AuditEvent } from '@/api/endpoints/audit';

type Bucket = 'all' | 'run' | 'import' | 'verdict' | 'llm';

function bucketOf(e: AuditEvent): Exclude<Bucket, 'all'> {
  const a = (e.action ?? '').toLowerCase();
  if (a.includes('llm') || a.includes('ai_analy') || a.includes('analysis')) {
    return 'llm';
  }
  if (a.includes('import') || a.includes('sync')) return 'import';
  if (a.includes('verdict') || a.includes('grade') || a.includes('feedback')) {
    return 'verdict';
  }
  if (
    a.includes('run') ||
    a.includes('plagiar') ||
    a.includes('check') ||
    a.includes('process')
  ) {
    return 'run';
  }
  return 'run';
}

function dotClass(e: AuditEvent, bucket: Exclude<Bucket, 'all'>): string {
  if (e.result === 'failure') return 'bg-sev-high';
  if (bucket === 'verdict') return 'bg-sev-mid';
  return 'bg-muted-foreground/60';
}

function describe(e: AuditEvent): string {
  const action = e.action ?? 'event';
  const resource = e.resource?.type
    ? `${e.resource.type}${e.resource.id ? ` ${e.resource.id}` : ''}`
    : '';
  return resource ? `${action} — ${resource}` : action;
}

function metaOf(e: AuditEvent): string | null {
  const parts: string[] = [];
  if (e.source_service) parts.push(e.source_service);
  if (e.resource?.parent_id && e.resource.parent_type) {
    parts.push(`${e.resource.parent_type}/${e.resource.parent_id}`);
  }
  if (e.request_id) parts.push(`req ${e.request_id.slice(0, 8)}`);
  return parts.length ? parts.join(' · ') : null;
}

function actorOf(e: AuditEvent): string {
  if (!e.actor) return 'system';
  return (
    e.actor.display_name ??
    e.actor.id ??
    (e.actor.type === 'system' ? 'system' : e.actor.type)
  );
}

function relTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(months / 12);
  return `${years}y ago`;
}

export default function ActivityLogPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('activity_log.title'));
  const [filter, setFilter] = useState<Bucket>('all');

  const { data, isLoading } = useAuditEvents({ limit: 50 });
  const events: AuditEvent[] = useMemo(() => data?.data ?? [], [data]);

  const visible = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((e) => bucketOf(e) === filter);
  }, [events, filter]);

  return (
    <Page width="wide" data-testid="activity-log-page">
      <PageHeader title={t('activity_log.title')} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Bucket)}>
          <TabsList>
            <TabsTrigger value="all">{t('activity_log.filter_all')}</TabsTrigger>
            <TabsTrigger value="run">{t('activity_log.filter_run')}</TabsTrigger>
            <TabsTrigger value="import">
              {t('activity_log.filter_import')}
            </TabsTrigger>
            <TabsTrigger value="verdict">
              {t('activity_log.filter_verdict')}
            </TabsTrigger>
            <TabsTrigger value="llm">{t('activity_log.filter_llm')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-muted-foreground">
          <span className="tabular-nums">{visible.length}</span>{' '}
          {t('activity_log.events_label')}
        </span>
      </div>

      {isLoading && visible.length === 0 ? (
        <Card className="border-border/70">
          <CardContent className="p-0">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className={`grid grid-cols-[120px_16px_1fr_auto] gap-4 px-5 py-4 ${
                  idx > 0 ? 'border-t border-border/70' : ''
                }`}
              >
                <Skeleton className="mt-0.5 h-3 w-16 bg-muted/40" />
                <Skeleton className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted/40" />
                <div className="min-w-0 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4 bg-muted/40" />
                  <Skeleton className="h-3 w-2/5 bg-muted/30" />
                </div>
                <Skeleton className="mt-0.5 h-3 w-20 bg-muted/40" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 px-6 text-center text-sm text-muted-foreground">
          {t('activity_log.empty')}
        </div>
      ) : (
        <Card className="border-border/70">
          <CardContent className="p-0">
            {visible.map((e, idx) => {
              const b = bucketOf(e);
              return (
                <div
                  key={e.id}
                  data-testid={`activity-row-${e.id}`}
                  className={`grid grid-cols-[120px_16px_1fr_auto] gap-4 px-5 py-4 ${
                    idx > 0 ? 'border-t border-border/70' : ''
                  }`}
                >
                  <div className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                    {relTime(e.occurred_at)}
                  </div>
                  <div className="pt-1.5">
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass(e, b)}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-snug text-foreground">
                      {describe(e)}
                    </div>
                    {metaOf(e) && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {metaOf(e)}
                      </div>
                    )}
                  </div>
                  <div className="whitespace-nowrap pt-0.5 text-xs text-muted-foreground">
                    {actorOf(e)}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </Page>
  );
}
