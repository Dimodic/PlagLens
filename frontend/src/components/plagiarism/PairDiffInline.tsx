/**
 * PairDiffInline — side-by-side diff for a single plagiarism pair.
 *
 * Fetches pair detail lazily (only when a pair id is given) and rebuilds
 * the two panes' content from fragment metadata — or from the full
 * submission source when the backend supplies it (``submissions.{a,b}
 * .content``), so the match ranges read as overlays on the complete
 * file rather than a stitched-together excerpt.
 *
 * Fragment fallback: Dolos doesn't emit per-line match ranges (only a
 * similarity number), so ``data.fragments`` arrives empty and the diff
 * had no highlighted bands at all. We synthesise them client-side by
 * **structural line matching** — normalise each line (collapse
 * whitespace, lowercase, replace identifiers/numbers/strings with
 * placeholders, keep language keywords + punctuation) and pair up
 * lines whose normalised form appears on the other side. That catches
 * renamed-variable copies ("int max1=0" vs "int m1=0" → same
 * skeleton) and surfaces real matches that line-level byte diffs
 * would miss. Consecutive matched lines collapse into a single
 * fragment so the overlay reads as a band, not a stripe pattern.
 *
 * One component, two call sites — guaranteed identical UI:
 *   • the in-modal flow on the submission page (PlagiarismMapDialog)
 *   • the standalone /plagiarism-runs/:runId/pairs/:pairId page
 */
import { Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { usePairDetail } from '@/hooks/api/usePlagiarism';
import type { PlagiarismPairFragment } from '@/api/endpoints/plagiarism';
import { SideBySideDiff } from './SideBySideDiff';

interface PairDiffInlineProps {
  runId: string;
  pairId: string;
}

export function PairDiffInline({ runId, pairId }: PairDiffInlineProps) {
  const { data, isLoading, error } = usePairDetail(runId, pairId);

  // ---- Hooks must run unconditionally — early returns sit below ----
  //
  // Everything that ends in ``useXxx`` needs to be called every render,
  // otherwise the loading→loaded transition adds a hook and React bails
  // with #310 ("Rendered more hooks than during the previous render").
  // We compute the derived values defensively (handling ``data ===
  // undefined``) and *then* branch on the loading / error state.

  type SubmissionInfoWithContent = { content?: string | null } & Record<
    string,
    unknown
  >;
  const aFull = data
    ? (data.submissions.a as SubmissionInfoWithContent).content
    : undefined;
  const bFull = data
    ? (data.submissions.b as SubmissionInfoWithContent).content
    : undefined;
  const fragments = data?.fragments ?? [];

  const buildContent = (side: 'a' | 'b'): string => {
    const full = side === 'a' ? aFull : bFull;
    if (typeof full === 'string' && full) return full;
    const lines: string[] = [];
    for (const f of fragments) {
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
    fragments.find((f: PlagiarismPairFragment) => f.a_file)?.a_file ??
    'submission';
  const bFile =
    fragments.find((f: PlagiarismPairFragment) => f.b_file)?.b_file ??
    'submission';
  const aFinal = buildContent('a');
  const bFinal = buildContent('b');
  // Fragment fallback — see file header. Compute once per (content,
  // backend-fragments) so the same pair doesn't re-tokenise on every
  // viewport repaint. Called unconditionally so React's hook order
  // stays stable across the loading→loaded transition.
  const synthetic = useMemo<{
    fragments: PlagiarismPairFragment[];
    colorIndices: number[];
  } | null>(() => {
    if (fragments.length > 0) return null;
    if (!aFinal || !bFinal) return { fragments: [], colorIndices: [] };
    return synthesiseFragmentsByStructuralLineMatch(aFinal, bFinal, {
      aFile,
      bFile,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, aFinal, bFinal, aFile, bFile]);
  const effectiveFragments = synthetic ? synthetic.fragments : fragments;
  const effectiveColorIndices = synthetic ? synthetic.colorIndices : undefined;

  // ---- Early returns now safe — every hook above has fired ----

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
          content: aFinal,
          authorName: data.submissions.a.author?.display_name,
        }}
        right={{
          filename: bFile,
          language: data.submissions.b.language,
          content: bFinal,
          authorName: data.submissions.b.author?.display_name,
        }}
        fragments={effectiveFragments}
        highlightedFragments={
          new Set(effectiveFragments.map((_f, i) => i))
        }
        // Synthetic fragments are emitted one-per-side; ``colorIndices``
        // ties each B-run to the colour of its corresponding A-run so a
        // pattern reused multiple times on B (e.g. ``cout/return`` once
        // inside the ``if`` AND once at the end of ``main``) reads as
        // the same group, not as two unrelated colours.
        colorIndices={effectiveColorIndices}
      />
    </div>
  );
}

export default PairDiffInline;

// ---------------------------------------------------------------------------
// Structural line-matching fallback (used when backend ships zero
// fragments — i.e. every Dolos run today).
// ---------------------------------------------------------------------------

/** Keywords kept verbatim by the normaliser — anything else gets
 *  collapsed to ``_`` so renamed variables / different literals still
 *  hash to the same skeleton. Covers C/C++/Java/Python/JS/Go/Rust at a
 *  shallow level; non-keyword identifiers all collapse anyway, so a
 *  missing keyword just makes that line slightly less specific. */
const STRUCTURAL_KEYWORDS: ReadonlySet<string> = new Set([
  // generic types
  'int', 'long', 'short', 'float', 'double', 'char', 'bool', 'boolean',
  'void', 'auto', 'const', 'static', 'extern', 'signed', 'unsigned',
  'size_t', 'string',
  // control flow
  'if', 'else', 'for', 'while', 'do', 'break', 'continue', 'switch',
  'case', 'default', 'return', 'goto',
  // OO / scoping
  'class', 'struct', 'public', 'private', 'protected', 'virtual',
  'override', 'new', 'delete', 'this', 'self', 'super',
  // namespacing / imports
  'namespace', 'using', 'include', 'import', 'from', 'package',
  // C/C++ stdlib bits the assignments always touch
  'std', 'cin', 'cout', 'endl', 'main',
  // booleans / nulls
  'true', 'false', 'null', 'none', 'nil',
  // python
  'def', 'lambda', 'pass', 'print', 'try', 'except', 'finally',
  'raise', 'with', 'as', 'in', 'is', 'and', 'or', 'not',
]);

/** Normalise a single source line into a "structural skeleton" that
 *  byte-compares to its renamed-variable twin. */
function normaliseLineForMatch(line: string): string {
  let s = line;
  // String/char literals → fixed placeholder so different prompts /
  // text still match structurally.
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '"_"');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, "'_'");
  // Numbers → ``_``.
  s = s.replace(/\b\d+(?:\.\d+)?\b/g, '_');
  // Identifier tokens → keep keywords, collapse everything else.
  s = s.replace(/\b[A-Za-z_][A-Za-z_0-9]*\b/g, (m) =>
    STRUCTURAL_KEYWORDS.has(m.toLowerCase()) ? m.toLowerCase() : '_',
  );
  // Collapse runs of placeholders (`_, _ , _`) — gets noisy otherwise.
  s = s.replace(/_(?:[\s,]+_)+/g, '_');
  // Whitespace collapse.
  s = s.replace(/\s+/g, '');
  return s;
}

interface SynthesiseOpts {
  aFile: string;
  bFile: string;
}

/** Build a per-line skeleton-match fragment list. Pure (no React); the
 *  caller wraps it in a ``useMemo``.
 *
 *  Output shape:
 *    * one fragment per A-run (b-side blanked to ``0..0``, no B highlight)
 *    * one fragment per B-run (a-side blanked to ``0..0``)
 *    * ``colorIndices[i]`` picks the palette slot for fragment ``i``:
 *        - A-run fragment i → slot = i (each A-run is its own group)
 *        - B-run fragment   → slot = the A-run index this B-run mostly
 *          maps to (so reused patterns share a colour with their
 *          originating A region)
 *
 *  The caller forwards ``colorIndices`` to ``SideBySideDiff`` which uses
 *  it instead of the default array-position rotation. Without that
 *  mapping the renderer was painting B-side-only runs in the next
 *  unused palette slot — visually inventing a "new" match group where
 *  there wasn't one (e.g. ``B[15-17]`` red while A had nothing red,
 *  because A only had two runs and B's third run rolled past the end). */
function synthesiseFragmentsByStructuralLineMatch(
  aContent: string,
  bContent: string,
  { aFile, bFile }: SynthesiseOpts,
): { fragments: PlagiarismPairFragment[]; colorIndices: number[] } {
  const aLines = aContent.split(/\r?\n/);
  const bLines = bContent.split(/\r?\n/);

  // Skeleton indexes for both sides.
  const bIndex = new Map<string, number[]>();
  bLines.forEach((line, i) => {
    const norm = normaliseLineForMatch(line);
    if (!isMeaningfulSkeleton(norm)) return;
    const lst = bIndex.get(norm);
    if (lst) lst.push(i + 1);
    else bIndex.set(norm, [i + 1]);
  });

  // For every B line that gets matched, remember which A line first
  // surfaced its skeleton — that A line's run is the B line's home
  // colour group. ``bLineToA`` is the bridge between B-runs and the
  // A-side palette.
  const matchedA = new Set<number>();
  const matchedB = new Set<number>();
  const bLineToA = new Map<number, number>();
  aLines.forEach((line, i) => {
    const norm = normaliseLineForMatch(line);
    if (!isMeaningfulSkeleton(norm)) return;
    const hits = bIndex.get(norm);
    if (!hits || hits.length === 0) return;
    const aLineNum = i + 1;
    matchedA.add(aLineNum);
    for (const lineB of hits) {
      matchedB.add(lineB);
      if (!bLineToA.has(lineB)) bLineToA.set(lineB, aLineNum);
    }
  });

  // Group into consecutive runs.
  const aRuns = groupConsecutive(matchedA);
  const bRuns = groupConsecutive(matchedB);

  // A-line → which A-run contains it.
  const aLineToRun = new Map<number, number>();
  aRuns.forEach((run, idx) => {
    for (let l = run.start; l <= run.end; l++) aLineToRun.set(l, idx);
  });

  // For each B-run, vote among its lines: which A-run does it
  // *mostly* refer to? That A-run's index is this B-run's colour slot.
  const bRunToARun: number[] = bRuns.map((bRun) => {
    const votes = new Map<number, number>();
    for (let l = bRun.start; l <= bRun.end; l++) {
      const aLine = bLineToA.get(l);
      if (aLine == null) continue;
      const aRunIdx = aLineToRun.get(aLine);
      if (aRunIdx == null) continue;
      votes.set(aRunIdx, (votes.get(aRunIdx) ?? 0) + 1);
    }
    let best = -1;
    let bestVotes = -1;
    for (const [k, v] of votes) {
      if (v > bestVotes) {
        best = k;
        bestVotes = v;
      }
    }
    return best;
  });

  // Emit fragments one-per-side. Blanking the opposite side to
  // ``0..0`` means the renderer's per-line zone map sees no real
  // line on that side for this fragment, so the highlight only paints
  // where it's supposed to.
  const fragments: PlagiarismPairFragment[] = [];
  const colorIndices: number[] = [];

  aRuns.forEach((run, idx) => {
    fragments.push({
      a_file: aFile,
      a_start_line: run.start,
      a_end_line: run.end,
      a_content: '',
      b_file: bFile,
      b_start_line: 0,
      b_end_line: 0,
      b_content: '',
    });
    colorIndices.push(idx);
  });

  bRuns.forEach((run, idx) => {
    fragments.push({
      a_file: aFile,
      a_start_line: 0,
      a_end_line: 0,
      a_content: '',
      b_file: bFile,
      b_start_line: run.start,
      b_end_line: run.end,
      b_content: '',
    });
    // Fall back to ``idx`` only if we couldn't vote (no A-run
    // shared a skeleton with any line in this B-run). In practice
    // that doesn't happen — every B-run inside ``matchedB`` has at
    // least one line with a matching A line.
    colorIndices.push(bRunToARun[idx] >= 0 ? bRunToARun[idx] : idx);
  });

  return { fragments, colorIndices };
}

function isMeaningfulSkeleton(s: string): boolean {
  if (s.length < 2) return false;
  // Lines like ``}``, ``{}``, ``;``, ``});`` are too common to be
  // signal — skip if there's no alphanumeric content.
  if (!/[a-z0-9_]/i.test(s)) return false;
  return true;
}

function groupConsecutive(lines: Set<number>): Array<{ start: number; end: number }> {
  const sorted = [...lines].sort((a, b) => a - b);
  const runs: Array<{ start: number; end: number }> = [];
  let cur: { start: number; end: number } | null = null;
  for (const ln of sorted) {
    if (!cur) {
      cur = { start: ln, end: ln };
      continue;
    }
    // Allow a one-line gap (often a blank or "}" between matched
    // statements) so a single boilerplate line in the middle doesn't
    // shred a run into 5 fragments.
    if (ln <= cur.end + 2) {
      cur.end = ln;
    } else {
      runs.push(cur);
      cur = { start: ln, end: ln };
    }
  }
  if (cur) runs.push(cur);
  return runs;
}
