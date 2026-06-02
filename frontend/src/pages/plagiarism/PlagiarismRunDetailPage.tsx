/**
 * /plagiarism-runs/:runId — similarity report.
 *
 * Hero meta line + tabs (Pairs / Clusters / Artifacts / Cross-course matches).
 * The Pairs tab has its own filter strip and a table/list view switcher.
 * Tab test-ids preserved (`plagiarism-tab-*`, `plagiarism-pairs-*`,
 * `plagiarism-artifact-*`, `pair-row-*`) so existing Playwright specs keep
 * working.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { ClusterCard } from '@/components/plagiarism/ClusterCard';
import { ClusterMapView } from '@/components/plagiarism/ClusterMapView';
import { PairTable } from '@/components/plagiarism/PairTable';
import { SubmissionPreviewDialog } from '@/components/plagiarism/SubmissionPreviewDialog';
import {
  SimilarityBar,
  similarityPercent,
} from '@/components/plagiarism/SimilarityBar';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePersistedTabState } from '@/hooks/usePersistedTabState';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useCancelRun,
  useClusters,
  usePairs,
  usePlagiarismReport,
  usePlagiarismRun,
  useRetryRun,
} from '@/hooks/api/usePlagiarism';
import type { PlagiarismPair } from '@/api/endpoints/plagiarism';
import type { Problem } from '@/api/types';
import { cn } from '@/components/ui/utils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Page } from '@/components/layout/Page';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

type ViewId = 'table' | 'list';

function fmt(date: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString().slice(0, 5)}`;
}

function statusBadge(status: string) {
  const tone: StatusTone =
    status === 'running' || status === 'queued'
      ? 'info'
      : status === 'completed'
        ? 'success'
        : status === 'failed' || status === 'cancelled'
          ? 'destructive'
          : 'neutral';
  return <StatusPill tone={tone}>{status}</StatusPill>;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

interface PairsTabProps {
  runId: string;
}

function PairsTab({ runId }: PairsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewId>('table');
  const [minSimilarity, setMinSimilarity] = useState(0.4);
  const [crossOnly, setCrossOnly] = useState(false);
  const { data, isLoading, error } = usePairs(runId, {
    min_similarity: minSimilarity,
    cross_course: crossOnly || undefined,
    sort: '-similarity',
    limit: 200,
  });

  const pairs: PlagiarismPair[] = useMemo(() => data?.data ?? [], [data]);

  const grouped = useMemo(() => {
    const map = new Map<string, PlagiarismPair[]>();
    for (const p of pairs) {
      const key = p.cross_course ? 'cross' : 'same';
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return map;
  }, [pairs]);

  return (
    <div data-testid="plagiarism-pairs-tab-content" className="space-y-4">
      {/* Filter strip */}
      <div className="flex flex-wrap items-center gap-4 border-b pb-4">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{t('plagiarism_run_detail.min_similarity')}</span>
          <span
            data-testid="plagiarism-pairs-min-similarity-value"
            className="font-mono font-medium tabular-nums text-foreground"
          >
            {similarityPercent(minSimilarity)}
          </span>
        </div>
        <div className="w-56" data-testid="plagiarism-pairs-min-similarity-slider">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[minSimilarity]}
            onValueChange={(v) => setMinSimilarity(v[0] ?? 0)}
          />
        </div>
        <label
          data-testid="plagiarism-pairs-cross-only"
          className="flex cursor-pointer items-center gap-2 text-sm text-foreground/90"
        >
          <Checkbox
            checked={crossOnly}
            onCheckedChange={(v) => setCrossOnly(v === true)}
          />
          {t('plagiarism_run_detail.cross_only')}
        </label>
        <div className="flex-1" />
        <Tabs value={view} onValueChange={(v) => setView(v as ViewId)}>
          <TabsList>
            <TabsTrigger value="table">
              {t('plagiarism_run_detail.view_table')}
            </TabsTrigger>
            <TabsTrigger value="list">
              {t('plagiarism_run_detail.view_list')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error && <ProblemAlert problem={error as unknown as Problem} />}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          {t('plagiarism_run_detail.loading_pairs')}
        </div>
      ) : (
        <div data-testid="plagiarism-pairs-list">
          {view === 'table' ? (
            <PairTable pairs={pairs} runId={runId} />
          ) : (
            <div className="flex flex-col gap-8">
              {Array.from(grouped.entries()).map(([key, list]) => (
                <section key={key} className="space-y-3">
                  <div className="flex items-baseline gap-3 border-b pb-3">
                    <h3 className="text-lg font-medium tracking-tight">
                      {key === 'cross'
                        ? t('plagiarism_run_detail.group_cross')
                        : t('plagiarism_run_detail.group_same')}
                    </h3>
                    <div className="flex-1" />
                    <span className="text-xs text-muted-foreground">
                      {t('plagiarism_run_detail.pairs_count', {
                        count: list.length,
                      })}
                    </span>
                  </div>
                  <Card className="border-border/70">
                    <CardContent className="p-0">
                      {list.map((p, idx) => {
                        const authorA =
                          p.a_author?.display_name ?? p.a_submission_id;
                        const authorB =
                          p.b_author?.display_name ?? p.b_submission_id;
                        return (
                          <div
                            key={p.id}
                            onClick={() =>
                              navigate(
                                `/plagiarism-runs/${runId}/pairs/${p.id}`,
                              )
                            }
                            data-testid={`pair-row-${p.id}`}
                            className={`flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                              idx > 0 ? 'border-t border-border/70' : ''
                            }`}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                                  {initials(authorA)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium truncate">
                                {authorA}
                              </span>
                              <span className="text-xs text-muted-foreground px-1">
                                ↔
                              </span>
                              <Avatar className="h-7 w-7">
                                <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                                  {initials(authorB)}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium truncate">
                                {authorB}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                <span className="tabular-nums">
                                  {p.matched_tokens}
                                </span>{' '}
                                tokens ·{' '}
                                <span className="tabular-nums">
                                  {p.fragments_count}
                                </span>{' '}
                                frag
                              </span>
                              <SimilarityBar value={p.similarity} width={120} />
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface MapTabProps {
  runId: string;
  /** Total submissions the run analysed — passed straight through to
   *  ClusterMapView's "N из M посылок" caption. */
  totalSubmissions?: number;
}

/** "Карта" tab — cluster diagram with coloured edges. Default tab so
 *  the first thing the teacher sees is the visual story (who's tied to
 *  whom by how strong a match) instead of a wall of numbers. Falls back
 *  to a friendly empty state when there are no pairs to draw. */
function MapTab({ runId, totalSubmissions }: MapTabProps) {
  const { t } = useTranslation();
  // Pull a generous slice of pairs + clusters — the graph is sized for
  // up to ~80 nodes so 200 pairs comfortably covers the common case
  // (assignment of ~50 students with O(N²) checks pruned to top
  // matches).
  const pairsQ = usePairs(runId, { limit: 200, sort: '-similarity' });
  const clustersQ = useClusters(runId);
  // Tap-target → modal showing the clicked student's source code. Lives
  // here (not inside ClusterMapView) so the modal portal sits at page
  // level and is unaffected by the map's internal pan/zoom.
  const [previewSubmissionId, setPreviewSubmissionId] = useState<
    string | null
  >(null);
  const isLoading = pairsQ.isLoading || clustersQ.isLoading;
  const error = pairsQ.error || clustersQ.error;
  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        {t('plagiarism_run_detail.loading_map')}
      </div>
    );
  }
  if (error) return <ProblemAlert problem={error as unknown as Problem} />;
  const pairs = pairsQ.data?.data ?? [];
  const clusters = clustersQ.data?.data ?? [];
  if (pairs.length === 0) {
    return (
      <EmptyState
        title={t('plagiarism_run_detail.map_empty_title')}
        description={t('plagiarism_run_detail.map_empty_description')}
      />
    );
  }
  return (
    <>
      <ClusterMapView
        pairs={pairs}
        clusters={clusters}
        runId={runId}
        totalSubmissions={totalSubmissions}
        onNodeClick={setPreviewSubmissionId}
      />
      <SubmissionPreviewDialog
        submissionId={previewSubmissionId}
        onOpenChange={(open) => {
          if (!open) setPreviewSubmissionId(null);
        }}
      />
    </>
  );
}

interface ClustersTabProps {
  runId: string;
}

function ClustersTab({ runId }: ClustersTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Just the clusters here — each card lazy-fetches its own pairs when
  // expanded (see ClusterCard / useClusterPairs), so we don't pull the
  // whole pair list up front.
  const { data, isLoading, error } = useClusters(runId);

  if (isLoading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        {t('plagiarism_run_detail.loading_clusters')}
      </div>
    );
  }
  if (error) return <ProblemAlert problem={error as unknown as Problem} />;
  if (!data || data.data.length === 0) {
    return <EmptyState title={t('plagiarism_run_detail.clusters_empty')} />;
  }
  // Document-style hairline list — no per-row Card chrome. Clusters
  // arrive pre-sorted by avg similarity desc from the backend.
  return (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {data.data.map((c) => (
        <ClusterCard
          key={c.id}
          cluster={c}
          runId={runId}
          onPairClick={(pairId) =>
            navigate(`/plagiarism-runs/${runId}/pairs/${pairId}`)
          }
        />
      ))}
    </div>
  );
}

export function PlagiarismRunDetailPage() {
  const { t } = useTranslation();
  const { runId = '' } = useParams<{ runId: string }>();
  useDocumentTitle(t('plagiarism_run_detail.title'));
  const notify = useNotifications();
  // Карта — default. Графическая разбивка пар по кластерам куда полезнее
  // голой таблицы при первом взгляде на отчёт. Persisted per-run so
  // opening a pair diff and coming back lands on the same tab, not
  // always "Карта".
  const [tab, setTab] = usePersistedTabState<string>(
    `plagiarism-run:${runId}`,
    'map',
  );

  const runQuery = usePlagiarismRun(runId);
  const reportQuery = usePlagiarismReport(runId);
  const cancel = useCancelRun(runId);
  const retry = useRetryRun(runId);

  if (runQuery.isLoading) {
    return (
      <div className="py-20 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        {t('plagiarism_run_detail.loading_report')}
      </div>
    );
  }
  if (runQuery.error) {
    return <ProblemAlert problem={runQuery.error as unknown as Problem} />;
  }
  if (!runQuery.data) {
    return null;
  }

  const run = runQuery.data;
  const summary = reportQuery.data?.summary;

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync();
      notify.info(t('plagiarism_run_detail.cancel_requested'));
    } catch (e) {
      const p = e as Problem;
      notify.error(
        p?.detail ?? p?.title ?? t('plagiarism_run_detail.cancel_failed'),
      );
    }
  };

  const handleRetry = async () => {
    try {
      await retry.mutateAsync();
      notify.success(t('plagiarism_run_detail.retry_done'));
    } catch (e) {
      const p = e as Problem;
      notify.error(
        p?.detail ?? p?.title ?? t('plagiarism_run_detail.retry_failed'),
      );
    }
  };

  return (
    <Page width="wide">
      {/* Hero */}
      <div className="flex flex-wrap items-end gap-6 border-b pb-5">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('plagiarism_run_detail.title')}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {statusBadge(run.status)}
            <span className="uppercase tracking-wider text-xs text-muted-foreground/70">
              {run.provider}
            </span>
            <span>
              {t('plagiarism_run_detail.started_at', {
                date: fmt(run.started_at),
              })}
            </span>
            <span>
              {t('plagiarism_run_detail.finished_at', {
                date: fmt(run.finished_at),
              })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(run.status === 'queued' || run.status === 'running') && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={cancel.isPending}
            >
              {cancel.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('plagiarism_run_detail.cancel')}
            </Button>
          )}
          {run.status === 'failed' && (
            <Button onClick={handleRetry} disabled={retry.isPending}>
              {retry.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('plagiarism_run_detail.retry')}
            </Button>
          )}
        </div>
      </div>

      {/* Stats — horizontal strip per design-system §5 StatsPanel
          ("одна горизонтальная строка, divide-x, НЕ сетка карточек"). */}
      <div className="flex flex-wrap divide-x divide-border/50 border-y border-border/50 py-5">
        {[
          {
            label: 'Max similarity',
            value: summary
              ? similarityPercent(summary.max_similarity)
              : '—',
            high: !!summary && summary.max_similarity > 0.7,
          },
          {
            label: 'Mean',
            value: summary
              ? similarityPercent(summary.mean_similarity)
              : '—',
          },
          {
            label: t('plagiarism_run_detail.stat_pairs_total'),
            value: summary?.pairs_total ?? '—',
          },
          {
            label: t('plagiarism_run_detail.stat_suspected'),
            value: summary?.pairs_suspected ?? '—',
            high: !!summary && summary.pairs_suspected > 0,
          },
          {
            label: t('plagiarism_run_detail.stat_clusters'),
            value: summary?.clusters_count ?? '—',
          },
          {
            label: t('plagiarism_run_detail.stat_submissions'),
            value: run.submissions_count,
          },
        ].map((it, i) => (
          <div
            key={i}
            className="flex-1 min-w-[120px] px-5 first:pl-0 last:pr-0"
          >
            <div className="text-xs text-muted-foreground">{it.label}</div>
            <div
              className={cn(
                'mt-1.5 font-mono text-2xl font-semibold tabular-nums',
                it.high ? 'text-red-500' : 'text-foreground',
              )}
            >
              {it.value}
            </div>
          </div>
        ))}
      </div>

      {run.error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="font-medium">{run.error.title}</div>
          {run.error.detail && (
            <div className="mt-1 whitespace-pre-wrap text-xs text-destructive/90">
              {run.error.detail}
            </div>
          )}
        </div>
      )}

      {/* Tabs — Карта / Пары / Кластеры. The Artifacts and Cross-course
          tabs were dropped: artifacts pointed at JPlag's raw HTML/JSON
          dumps (broken, and not something a grader needs), and the
          cross-course tab was a one-line stub that never worked. */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="plagiarism-run-tabs">
          <TabsTrigger value="map" data-testid="plagiarism-tab-map">
            {t('plagiarism_run_detail.tab_map')}
          </TabsTrigger>
          <TabsTrigger value="pairs" data-testid="plagiarism-tab-pairs">
            {t('plagiarism_run_detail.tab_pairs')}
          </TabsTrigger>
          <TabsTrigger value="clusters" data-testid="plagiarism-tab-clusters">
            {t('plagiarism_run_detail.tab_clusters')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="mt-6">
          <MapTab runId={run.id} totalSubmissions={run.submissions_count} />
        </TabsContent>
        <TabsContent value="pairs" className="mt-6">
          <PairsTab runId={run.id} />
        </TabsContent>
        <TabsContent value="clusters" className="mt-6">
          <ClustersTab runId={run.id} />
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default PlagiarismRunDetailPage;
