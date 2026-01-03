/**
 * Expandable cluster row.
 *
 * Document-style (no Card chrome) to match the rest of PlagLens — the
 * parent renders these inside a hairline-divided list.
 *
 * Collapsed: cluster name, language, member avatars, participant count,
 * average similarity bar — plus a chevron hinting it opens.
 * Expanded: the pairwise comparisons *within* the cluster, lazy-fetched
 * on first open. Each row links into the side-by-side diff. This is the
 * answer to "непонятно что сравнивать" — a cluster is a group, the
 * pairs are the actual A↔B comparisons a grader acts on.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/components/ui/utils';
import { useClusterPairs } from '@/hooks/api/usePlagiarism';
import type { PlagiarismCluster } from '@/api/endpoints/plagiarism';
import { SimilarityBar } from './SimilarityBar';

interface ClusterCardProps {
  cluster: PlagiarismCluster;
  runId: string;
  /** Navigate to the side-by-side diff for a pair. */
  onPairClick: (pairId: string) => void;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ClusterCard({
  cluster,
  runId,
  onPairClick,
}: ClusterCardProps) {
  const [open, setOpen] = useState(false);
  // Lazy — the request only fires once the row is expanded.
  const pairsQ = useClusterPairs(runId, cluster.id, { enabled: open });
  const pairs = pairsQ.data ?? [];

  // Resolve member identities. The backend now sends ``member_authors``
  // aligned with ``members``; fall back to the raw id only for older
  // runs where the map wasn't populated.
  const authors =
    cluster.member_authors && cluster.member_authors.length > 0
      ? cluster.member_authors
      : cluster.members.map((m) => ({ id: m, display_name: m }));
  const visibleAuthors = authors.slice(0, 5);
  const remaining = authors.length - visibleAuthors.length;

  return (
    <div>
      {/* Header — the whole row toggles the pair list. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`cluster-card-${cluster.id}`}
        className="flex w-full items-center gap-4 px-2 py-3 text-left transition-colors hover:bg-muted/30"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              Кластер {cluster.id.slice(-6)}
            </span>
            {cluster.dominant_language && (
              <span className="font-mono text-xs text-muted-foreground">
                {cluster.dominant_language}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              · {cluster.members.length} участников
            </span>
          </div>

          <div className="mt-1.5 flex items-center -space-x-2">
            {visibleAuthors.map((a) => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <Avatar className="size-6 ring-2 ring-background">
                    <AvatarFallback className="bg-accent text-accent-foreground text-[10px]">
                      {initials(a.display_name ?? a.id)}
                    </AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>{a.display_name ?? a.id}</TooltipContent>
              </Tooltip>
            ))}
            {remaining > 0 && (
              <Avatar className="size-6 ring-2 ring-background">
                <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">
                  +{remaining}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Средняя схожесть
          </span>
          <SimilarityBar value={cluster.avg_similarity} width={110} />
        </div>
      </button>

      {/* Expanded — pairwise comparisons inside the cluster. Indented +
          tinted so it reads as "belongs to the row above". */}
      {open && (
        <div className="bg-muted/15 pl-8">
          {pairsQ.isLoading ? (
            <div className="flex items-center justify-center gap-2 px-2 py-5 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка пар…
            </div>
          ) : pairs.length === 0 ? (
            <div className="px-2 py-5 text-center text-sm text-muted-foreground">
              Пары внутри кластера не найдены.
            </div>
          ) : (
            <div className="flex flex-col">
              {pairs.map((p) => {
                const aName =
                  p.a_author?.display_name ?? p.a_submission_id;
                const bName =
                  p.b_author?.display_name ?? p.b_submission_id;
                const high = p.similarity >= 0.85;
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onPairClick(p.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onPairClick(p.id);
                      }
                    }}
                    data-testid={`cluster-pair-${p.id}`}
                    className="flex cursor-pointer items-center gap-3 border-t border-border/40 px-2 py-2.5 transition-colors first:border-t-0 hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        'inline-block h-1.5 w-1.5 shrink-0 rounded-full',
                        high ? 'bg-red-500' : 'bg-amber-500',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <span className="font-medium">{aName}</span>
                      <span className="text-muted-foreground"> ↔ </span>
                      <span className="font-medium">{bName}</span>
                    </span>
                    <span className="font-mono text-sm tabular-nums text-foreground/90">
                      {(p.similarity * 100).toFixed(1)}%
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ClusterCard;
