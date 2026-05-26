/**
 * Side-by-side diff viewer for plagiarism pair fragments.
 *
 * Renders two columns of code with line numbers, with matched line ranges
 * highlighted. Highlighting can be toggled per fragment.
 */
import { useEffect, useMemo, useRef } from 'react';
import { cn } from '@/components/ui/utils';
import type { PlagiarismPairFragment } from '@/api/endpoints/plagiarism';

export interface DiffSide {
  filename: string;
  language?: string;
  content: string;
  authorName?: string;
}

interface SideBySideDiffProps {
  left: DiffSide;
  right: DiffSide;
  fragments: PlagiarismPairFragment[];
  /** Indices of fragments that should be highlighted in the gutter. */
  highlightedFragments?: Set<number>;
  /** Index of fragment to scroll-to in both panes (re-runs on change). */
  scrollToFragment?: number | null;
  /** When true, every fragment uses the same palette slot. Use this for
   *  synthetic fragments (client-side structural matching) where the
   *  index doesn't carry "this A region maps to that B region" meaning
   *  — multi-colour rotation in that case reads as a false pairing
   *  signal ("why is B[15-17] red while A has nothing red?" — because
   *  the synthesiser ran out of A runs and reused the last one, NOT
   *  because that B region matched something else specific). With
   *  multi-colour off it just says "this line participated in the
   *  match", which is the honest claim. */
  monochromeHighlights?: boolean;
}

interface HighlightZone {
  start: number;
  end: number;
  index: number;
}

/**
 * Per-fragment palette using the PlagLens severity tokens. We rotate through
 * the three tones so adjacent fragments are visually distinguishable while
 * staying inside the design system.
 */

/** Map verbose compiler/runtime ids ("clang14_cpp20", "python_3.8") to
 *  short, readable language labels. Anything we don't recognise falls
 *  back to the raw token. Mirrors CodeViewer's shortLang helper. */
function shortLang(raw: string): string {
  const lower = raw.toLowerCase();
  if (/(?:^|[^a-z])(c\+\+|cpp\d*|gcc|clang|g\+\+)/.test(lower)) return 'cpp';
  if (/(?:^|[^a-z])(py|python)\d*/.test(lower)) return 'python';
  if (/(?:^|[^a-z])(java)\d*/.test(lower) && !lower.startsWith('javascript'))
    return 'java';
  if (/(?:^|[^a-z])(c#|csharp|dotnet|mono)/.test(lower)) return 'c#';
  if (/(?:^|[^a-z])go\d*/.test(lower)) return 'go';
  if (/(?:^|[^a-z])(rust|rustc)/.test(lower)) return 'rust';
  if (/(?:^|[^a-z])(node|js|javascript)/.test(lower)) return 'js';
  if (/(?:^|[^a-z])(ts|typescript)/.test(lower)) return 'ts';
  if (/(?:^|[^a-z])kotlin/.test(lower)) return 'kotlin';
  if (/(?:^|[^a-z])swift/.test(lower)) return 'swift';
  return raw.length > 8 ? raw.slice(0, 8) : raw;
}

// Earlier palette used solid sev-*-bg fills which painted every line
// of a 100% match a vivid amber wall — visually exhausting for the
// grader. Switched to ~10 % alpha tints so highlighted regions read
// as "noticed" rather than "screaming"; the left-border accent
// continues to mark fragment boundaries crisply.
const ZONE_PALETTE: { fill: string; border: string }[] = [
  { fill: 'bg-amber-500/10', border: 'border-l-amber-500' },
  { fill: 'bg-sky-500/10', border: 'border-l-sky-500' },
  { fill: 'bg-red-500/10', border: 'border-l-red-500' },
  { fill: 'bg-primary/10', border: 'border-l-primary' },
  { fill: 'bg-emerald-500/10', border: 'border-l-emerald-500' },
];

function zoneClasses(
  idx: number,
  monochrome = false,
): { fill: string; border: string } {
  if (monochrome) return ZONE_PALETTE[0];
  return ZONE_PALETTE[idx % ZONE_PALETTE.length];
}

function buildSideZones(
  fragments: PlagiarismPairFragment[],
  side: 'a' | 'b',
  visible: Set<number>,
): HighlightZone[] {
  return fragments
    .map((f, i) => ({
      start: side === 'a' ? f.a_start_line : f.b_start_line,
      end: side === 'a' ? f.a_end_line : f.b_end_line,
      index: i,
    }))
    .filter((z) => visible.has(z.index));
}

interface PaneProps {
  side: DiffSide;
  zones: HighlightZone[];
  scrollToLine?: number | null;
  monochrome?: boolean;
}

function Pane({ side, zones, scrollToLine, monochrome }: PaneProps) {
  // `side.content` is built from fragments whose `a_content`/`b_content`
  // may be null on older runs; guard so we never .split(null) → 500.
  const lines = useMemo(
    () => (side.content ?? '').split(/\r?\n/),
    [side.content],
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const zoneByLine = useMemo(() => {
    const map = new Map<number, HighlightZone>();
    zones.forEach((z) => {
      for (let l = z.start; l <= z.end; l++) {
        if (!map.has(l)) map.set(l, z);
      }
    });
    return map;
  }, [zones]);

  useEffect(() => {
    if (scrollToLine == null) return;
    const node = lineRefs.current[scrollToLine];
    if (node && viewportRef.current) {
      const top = node.offsetTop - 24;
      viewportRef.current.scrollTo({ top, behavior: 'smooth' });
    }
  }, [scrollToLine]);

  return (
    <div
      // Self-sizing column: pane height matches the code panel above
      // (which is itself bounded by ``max-h-full``). No ``flex-1``
      // here — that would re-grow to fill the parent and bring back
      // the empty-card-under-the-code visual.
      className="relative flex min-w-0 flex-1 flex-col gap-2 min-h-0 max-h-full"
      aria-label={`pane-${side.filename}`}
    >
      {/* Language label sits *inside* the code panel's top-right
          corner — matches the same pattern as CodeViewer on the
          submission page (plain muted text, not a Badge). The per-
          pane name header used to live here too but moved up into
          a unified row above the diff (see PairDiffInline). */}
      <div
        ref={viewportRef}
        // Auto-height with a viewport-based cap so the bg-card hugs
        // the code lines (no empty card under short snippets) but
        // also doesn't run off-modal for long ones. ``70vh`` is just
        // shy of the modal's 92vh, leaving room for the header strip
        // and a comfortable bottom gap.
        className="relative max-h-[70vh] overflow-auto rounded-md border border-border bg-card"
      >
        {side.language && (
          <span
            className="pointer-events-none absolute right-3 top-2 z-10 text-xs text-muted-foreground/70 select-none"
            data-testid="pair-pane-language"
          >
            {shortLang(side.language)}
          </span>
        )}
        <div className="font-mono text-xs leading-[18px] whitespace-pre">
          {lines.map((line, idx) => {
            const lineNo = idx + 1;
            const zone = zoneByLine.get(lineNo);
            const colors = zone ? zoneClasses(zone.index, monochrome) : null;
            return (
              <div
                key={lineNo}
                ref={(el) => {
                  lineRefs.current[lineNo] = el;
                }}
                data-line={lineNo}
                data-fragment={zone?.index}
                className={cn(
                  'flex border-l-[3px] px-1.5',
                  colors ? cn(colors.fill, colors.border) : 'border-l-transparent',
                )}
              >
                <span className="w-10 select-none pr-2 text-right text-muted-foreground">
                  {lineNo}
                </span>
                <span className="flex-1">{line || ' '}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SideBySideDiff({
  left,
  right,
  fragments,
  highlightedFragments,
  scrollToFragment,
  monochromeHighlights,
}: SideBySideDiffProps) {
  const visible = highlightedFragments ?? new Set(fragments.map((_, i) => i));
  const aZones = buildSideZones(fragments, 'a', visible);
  const bZones = buildSideZones(fragments, 'b', visible);

  const scrollToLineLeft =
    scrollToFragment != null ? fragments[scrollToFragment]?.a_start_line ?? null : null;
  const scrollToLineRight =
    scrollToFragment != null ? fragments[scrollToFragment]?.b_start_line ?? null : null;

  return (
    <div
      // ``w-full`` to claim the modal's full width; ``items-start``
      // so each pane sizes to its own content, not stretched. Without
      // items-start the shorter pane padded down to match the taller
      // one — gives a giant empty box under the shorter side.
      className="flex h-full w-full flex-1 min-h-0 min-w-0 items-start gap-4 border-t border-border pt-3"
      data-testid="pair-side-by-side-diff"
    >
      <div
        className="flex min-w-0 flex-1 min-h-0"
        data-testid="pair-pane-left"
      >
        <Pane
          side={left}
          zones={aZones}
          scrollToLine={scrollToLineLeft}
          monochrome={monochromeHighlights}
        />
      </div>
      <div
        className="flex min-w-0 flex-1 min-h-0"
        data-testid="pair-pane-right"
      >
        <Pane
          side={right}
          zones={bZones}
          scrollToLine={scrollToLineRight}
          monochrome={monochromeHighlights}
        />
      </div>
    </div>
  );
}

export default SideBySideDiff;
