/**
 * PairDiffInline — side-by-side diff for a single plagiarism pair.
 *
 * Fetches pair detail lazily (only when a pair id is given) and rebuilds
 * the two panes' content from fragment metadata — or from the full
 * submission source when the backend supplies it (``submissions.{a,b}
 * .content``), so the match ranges read as overlays on the complete
 * file rather than a stitched-together excerpt.
 *
 * One component, two call sites — guaranteed identical UI:
 *   • the in-modal flow on the submission page (PlagiarismMapDialog)
 *   • the standalone /plagiarism-runs/:runId/pairs/:pairId page
 */
import { Loader2 } from 'lucide-react';
import { usePairDetail } from '@/hooks/api/usePlagiarism';
import type { PlagiarismPairFragment } from '@/api/endpoints/plagiarism';
import { SideBySideDiff } from './SideBySideDiff';

interface PairDiffInlineProps {
  runId: string;
  pairId: string;
}

export function PairDiffInline({ runId, pairId }: PairDiffInlineProps) {
  const { data, isLoading, error } = usePairDetail(runId, pairId);

  if (isLoading) {
    return (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Загрузка пары…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="py-8 text-center text-sm text-destructive">
        Не удалось загрузить детали пары.
      </div>
    );
  }

  // Prefer the full submission source when the backend supplies it
  // (submissions.{a,b}.content) — match ranges then become overlays
  // on the complete file, so the closing brace of ``main`` and any
  // surrounding helper functions stay visible. Older runs without
  // content fall back to the fragment-stitch below.
  type SubmissionInfoWithContent = { content?: string | null } & Record<
    string,
    unknown
  >;
  const aFull = (data.submissions.a as SubmissionInfoWithContent).content;
  const bFull = (data.submissions.b as SubmissionInfoWithContent).content;
  const buildContent = (side: 'a' | 'b'): string => {
    const full = side === 'a' ? aFull : bFull;
    if (typeof full === 'string' && full) return full;
    const lines: string[] = [];
    for (const f of data.fragments) {
      const start = side === 'a' ? f.a_start_line : f.b_start_line;
      const end = side === 'a' ? f.a_end_line : f.b_end_line;
      const content = (side === 'a' ? f.a_content : f.b_content) ?? '';
      while (lines.length < start - 1) lines.push('');
      const fragLines = content.split(/\r?\n/);
      for (let i = 0; i < fragLines.length && start + i - 1 < end; i++) {
        lines[start + i - 1] = fragLines[i];
      }
    }
    return lines.join('\n');
  };

  const aFile =
    data.fragments.find((f: PlagiarismPairFragment) => f.a_file)?.a_file ??
    'submission';
  const bFile =
    data.fragments.find((f: PlagiarismPairFragment) => f.b_file)?.b_file ??
    'submission';
  const aName = data.submissions.a.author?.display_name ?? 'студент A';
  const bName = data.submissions.b.author?.display_name ?? 'студент B';
  const simPct = (data.similarity * 100).toFixed(1);

  return (
    <div className="flex h-full flex-col gap-3 min-h-0">
      {/* Unified header: left author │ similarity in the middle │ right
          author. The percent sits centred so the eye reads it as a
          relationship between the two sides. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 shrink-0">
        <span className="text-sm font-semibold text-foreground truncate">
          {aName}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {simPct}%
        </span>
        <span className="text-sm font-semibold text-foreground text-right truncate">
          {bName}
        </span>
      </div>
      <SideBySideDiff
        left={{
          filename: aFile,
          language: data.submissions.a.language,
          content: buildContent('a'),
          authorName: data.submissions.a.author?.display_name,
        }}
        right={{
          filename: bFile,
          language: data.submissions.b.language,
          content: buildContent('b'),
          authorName: data.submissions.b.author?.display_name,
        }}
        fragments={data.fragments}
        highlightedFragments={new Set(data.fragments.map((_f, i) => i))}
      />
    </div>
  );
}

export default PairDiffInline;
