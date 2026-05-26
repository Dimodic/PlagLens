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

  // Fragment fallback — see file header. Compute once per (content,
  // backend-fragments) so the same pair doesn't re-tokenise on every
  // viewport repaint.
  const aFinal = buildContent('a');
  const bFinal = buildContent('b');
  const effectiveFragments = useMemo<PlagiarismPairFragment[]>(() => {
    if (data.fragments.length > 0) return data.fragments;
    if (!aFinal || !bFinal) return [];
    return synthesiseFragmentsByStructuralLineMatch(aFinal, bFinal, {
      aFile,
      bFile,
    });
    // aFinal/bFinal are derived from `data`; depending on `data` covers
    // them transitively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.fragments, aFinal, bFinal, aFile, bFile]);

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
 *  caller wraps it in a ``useMemo``. */
function synthesiseFragmentsByStructuralLineMatch(
  aContent: string,
  bContent: string,
  { aFile, bFile }: SynthesiseOpts,
): PlagiarismPairFragment[] {
  const aLines = aContent.split(/\r?\n/);
  const bLines = bContent.split(/\r?\n/);

  // Index B by normalised line. We also need to know how rare the
  // skeleton is — a blank line or a stand-alone ``}`` matches dozens
  // of places and would paint every brace on the page; treat skeletons
  // shorter than 2 chars or made of pure punctuation as too noisy.
  const bIndex = new Map<string, number[]>();
  bLines.forEach((line, i) => {
    const norm = normaliseLineForMatch(line);
    if (!isMeaningfulSkeleton(norm)) return;
    const lst = bIndex.get(norm);
    if (lst) lst.push(i + 1);
    else bIndex.set(norm, [i + 1]);
  });

  const matchedA = new Set<number>();
  const matchedB = new Set<number>();
  aLines.forEach((line, i) => {
    const norm = normaliseLineForMatch(line);
    if (!isMeaningfulSkeleton(norm)) return;
    const hits = bIndex.get(norm);
    if (!hits || hits.length === 0) return;
    matchedA.add(i + 1);
    for (const lineB of hits) matchedB.add(lineB);
  });

  // Group consecutive matched lines into runs — the renderer paints
  // each run as one band with a coloured left border, which reads as
  // "this block of code matched" rather than a flicker of single
  // lines.
  const aRuns = groupConsecutive(matchedA);
  const bRuns = groupConsecutive(matchedB);

  // Pair the i-th A-run with the i-th B-run for fragment indexing; if
  // the counts differ, we still attach what we have — extra runs on
  // either side become standalone fragments referring to the matching
  // side's last range (good enough for highlight purposes).
  const out: PlagiarismPairFragment[] = [];
  const total = Math.max(aRuns.length, bRuns.length);
  for (let i = 0; i < total; i++) {
    const aRun = aRuns[i] ?? aRuns[aRuns.length - 1] ?? { start: 0, end: 0 };
    const bRun = bRuns[i] ?? bRuns[bRuns.length - 1] ?? { start: 0, end: 0 };
    if (aRun.start === 0 && bRun.start === 0) continue;
    out.push({
      a_file: aFile,
      a_start_line: aRun.start,
      a_end_line: aRun.end,
      a_content: '',
      b_file: bFile,
      b_start_line: bRun.start,
      b_end_line: bRun.end,
      b_content: '',
    });
  }
  return out;
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
