/**
 * ClusterMapView — force-directed-style cluster diagram for a plagiarism
 * run.
 *
 * Nodes are students (one per unique pair endpoint), grouped visually by
 * cluster membership. Edges between two students carry a colour driven
 * by the pair's similarity:
 *
 *   • similarity ≥ 0.85  → "High match" — destructive red
 *   • similarity ≥ 0.50  → "Partial"    — amber
 *   • otherwise          → "Touches"    — slate
 *
 * Layout is intentionally simple (no force-sim library): we place each
 * cluster centre on a horizontal row, then arrange that cluster's
 * members on a circle around the centre. Unclustered students go into
 * a synthetic "outliers" bucket at the right. Works fine up to ~80
 * nodes; beyond that an actual force-directed library would be needed.
 *
 * Cluster fill: filled-dark for clusters with at least one high-match
 * edge, outlined-white otherwise (matches the user's reference design).
 */
import { Link } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PlagiarismCluster,
  PlagiarismPair,
} from '@/api/endpoints/plagiarism';
import { useTranslation } from '@/i18n';
import { cn } from '@/components/ui/utils';

interface ClusterMapViewProps {
  pairs: PlagiarismPair[];
  clusters: PlagiarismCluster[];
  runId: string;
  /** When set, the matching node is drawn with a primary-coloured ring
   *  and the viewBox shifts so this node sits near the centre of the
   *  visible area. Used by the submission-page modal so the grader
   *  spots "themselves" in the network without scanning labels. */
  focusSubmissionId?: string;
  /** Edge click handler. When provided, edges call this with the pair
   *  id instead of navigating away (the submission-page modal swaps
   *  itself into a side-by-side diff view). When omitted, edges fall
   *  back to a <Link> to the standalone pair-diff page. */
  onPairClick?: (pairId: string) => void;
  /** Node click handler. When set, clicking a circle calls back with
   *  the submission id — the parent typically opens a modal showing
   *  that student's source code so a teacher can eyeball the code
   *  without leaving the map. */
  onNodeClick?: (submissionId: string) => void;
  /** Total submissions the run analysed. When provided, the map renders
   *  a caption — "N из M посылок с совпадениями" — so a teacher doesn't
   *  misread the (deliberately small) cluster graph as "only N students
   *  submitted". The map only draws students who matched someone;
   *  everyone else is clean and intentionally absent. */
  totalSubmissions?: number;
}

interface NodeLayout {
  submissionId: string;
  label: string;
  clusterIdx: number; // -1 for outliers
  cx: number;
  cy: number;
  /** Centre of the cluster this node belongs to — used to position the
   *  label radially outward, so labels can't collide with adjacent
   *  nodes inside a dense cluster. */
  clusterCx: number;
  clusterCy: number;
  filled: boolean;
  /** True when this node has at least one non-touches edge (high or
   *  partial). Drives the "this dot actually matters" filled style. */
  hasStrongEdge: boolean;
}

interface EdgeLayout {
  pair: PlagiarismPair;
  tier: 'high' | 'partial' | 'touches';
  aId: string;
  bId: string;
}

const HIGH_SIM = 0.85;
const PARTIAL_SIM = 0.5;
// Minimum similarity for a pair to be drawn as an edge *and* for its
// endpoints to appear as nodes at all. JPlag emits a long tail of
// near-0 % "pairs" (shared boilerplate, empty matches); drawing nodes
// for those produced a giant useless ring of disconnected students.
const MIN_EDGE_SIMILARITY = 0.05;

const EDGE_STROKE: Record<EdgeLayout['tier'], string> = {
  high: 'stroke-red-500',
  partial: 'stroke-amber-500',
  // Touches dominate the graph by sheer count — push them way down
  // (15 % opacity, hair-thin) so the high/partial edges actually read.
  // The grader can still hover for tooltip if they need detail.
  touches: 'stroke-muted-foreground/15',
};
const EDGE_WIDTH: Record<EdgeLayout['tier'], number> = {
  high: 2.5,
  partial: 2,
  touches: 0.6,
};

function classifyTier(similarity: number): EdgeLayout['tier'] {
  if (similarity >= HIGH_SIM) return 'high';
  if (similarity >= PARTIAL_SIM) return 'partial';
  return 'touches';
}

function shortLabel(name: string): string {
  // "Петрова Екатерина" → "Петрова Е." — keeps the chart readable
  // when 20+ students sit on the canvas.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].charAt(0)}.`;
}

export function ClusterMapView({
  pairs,
  clusters,
  runId,
  focusSubmissionId,
  onPairClick,
  onNodeClick,
  totalSubmissions,
}: ClusterMapViewProps) {
  const { t } = useTranslation();
  const layout = useMemo(() => buildLayout(pairs, clusters), [pairs, clusters]);

  const { nodes, edges, width, height } = layout;
  const focusNode = focusSubmissionId
    ? nodes.find((n) => n.submissionId === focusSubmissionId)
    : null;

  // Pan/zoom state in viewBox coordinates. Initial framing centres
  // on the focus node (zoom ≈ 1.6) when one is provided; otherwise we
  // show the whole canvas. The user can then wheel-zoom anywhere and
  // drag to pan — typical SVG-graph interactions.
  const INITIAL_ZOOM = focusNode ? 1.6 : 1;
  const initial = useMemo(() => {
    if (focusNode) {
      const vw = width / INITIAL_ZOOM;
      const vh = height / INITIAL_ZOOM;
      return {
        x: clamp(focusNode.cx - vw / 2, 0, Math.max(0, width - vw)),
        y: clamp(focusNode.cy - vh / 2, 0, Math.max(0, height - vh)),
        zoom: INITIAL_ZOOM,
      };
    }
    return { x: 0, y: 0, zoom: 1 };
    // initial framing is computed once per (layout, focusSubmissionId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, focusNode?.cx, focusNode?.cy]);
  const [view, setView] = useState(initial);
  // Re-centre when the inputs change (new run / new focus target).
  useEffect(() => {
    setView(initial);
  }, [initial]);

  const svgRef = useRef<SVGSVGElement | null>(null);

  // Mirror `view` into a ref so the native wheel listener (attached
  // once below) always reads the current value without re-binding.
  const viewRef = useRef(view);
  viewRef.current = view;

  // ---- Wheel zoom (around the cursor position) ----
  // React's synthetic ``onWheel`` is registered passive, so calling
  // ``preventDefault()`` inside it is a no-op and the *page* scrolls
  // behind the chart. We attach a non-passive native listener instead
  // so the wheel zooms the map and the page stays put.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const rect = svg.getBoundingClientRect();
      // Mouse position in viewBox units (where the user "pointed").
      const px =
        v.x + ((e.clientX - rect.left) / rect.width) * (width / v.zoom);
      const py =
        v.y + ((e.clientY - rect.top) / rect.height) * (height / v.zoom);
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      const nextZoom = clamp(v.zoom * factor, 0.6, 6);
      const vw = width / nextZoom;
      const vh = height / nextZoom;
      // Pan so the cursor stays over the same world coordinate.
      const nx = clamp(
        px - ((e.clientX - rect.left) / rect.width) * vw,
        -width,
        width * 2,
      );
      const ny = clamp(
        py - ((e.clientY - rect.top) / rect.height) * vh,
        -height,
        height * 2,
      );
      setView({ x: nx, y: ny, zoom: nextZoom });
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, [width, height]);

  // ---- Drag pan ----
  const dragRef = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only when clicking the empty canvas — let edges/nodes handle
    // their own clicks via stopPropagation if needed.
    if ((e.target as Element).tagName === 'svg' ||
        (e.target as Element).tagName === 'rect') {
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        vx: view.x,
        vy: view.y,
      };
    }
  };
  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vw = width / view.zoom;
    const vh = height / view.zoom;
    const dx = ((e.clientX - d.x) / rect.width) * vw;
    const dy = ((e.clientY - d.y) / rect.height) * vh;
    setView({ x: d.vx - dx, y: d.vy - dy, zoom: view.zoom });
  };
  const onMouseUp = () => {
    dragRef.current = null;
  };

  const resetView = () => setView(initial);

  const viewBox = `${view.x} ${view.y} ${width / view.zoom} ${height / view.zoom}`;

  const zoomBy = (factor: number) => {
    const nextZoom = clamp(view.zoom * factor, 0.6, 6);
    // Zoom around the canvas centre when triggered via button.
    const vw = width / nextZoom;
    const vh = height / nextZoom;
    const cx = view.x + width / view.zoom / 2;
    const cy = view.y + height / view.zoom / 2;
    setView({
      x: clamp(cx - vw / 2, -width, width * 2),
      y: clamp(cy - vh / 2, -height, height * 2),
      zoom: nextZoom,
    });
  };

  // Empty state — kept AFTER every hook above so the hook count is identical
  // whether or not there are matches. A return before the hooks changes the
  // hook order between renders → React error #310 (white-screen crash).
  if (nodes.length === 0) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {totalSubmissions != null && totalSubmissions > 0
          ? t('cluster_map.empty_checked', { count: totalSubmissions })
          : t('cluster_map.empty')}
      </div>
    );
  }

  return (
    <div
      data-testid="plagiarism-cluster-map"
      // No ``flex-1 / h-full`` here: container sizes to content (SVG
      // with a fixed aspect ratio + legend). Previously the chart
      // claimed ``min-h-[70vh]`` and ``flex-1`` together which made
      // it gulp the entire modal height and pushed the legend off
      // the visible area, plus the SVG ended up taller than its
      // viewBox so the chart sat tucked in one corner. With explicit
      // aspect-ratio sizing the modal stays compact and the legend
      // is always anchored just below the canvas.
      className="relative flex flex-col rounded-md border border-border/60 bg-muted/10 p-4"
    >
      {/* Context caption — the map only draws students who matched
          someone, so without this line a teacher reads "5 nodes" as
          "only 5 people submitted". ``pr-16`` keeps it clear of the
          absolute zoom controls in the top-right corner. */}
      {totalSubmissions != null && totalSubmissions > 0 && (
        <p
          data-testid="plagiarism-cluster-map-caption"
          className="mb-3 pr-16 text-xs text-muted-foreground"
        >
          {t('cluster_map.caption', {
            matched: nodes.length,
            total: totalSubmissions,
          })}
        </p>
      )}
      {/* Zoom controls — small, top-right, over the canvas. Native
          wheel + drag still work; these are for users who don't
          remember the gestures or are on touchpad. */}
      <div className="absolute right-6 top-6 z-10 flex flex-col gap-1 rounded-md border border-border/60 bg-background/90 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => zoomBy(1.25)}
          className="h-7 w-7 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
          aria-label={t('cluster_map.zoom_in')}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => zoomBy(1 / 1.25)}
          className="h-7 w-7 rounded text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60"
          aria-label={t('cluster_map.zoom_out')}
        >
          −
        </button>
        <button
          type="button"
          onClick={resetView}
          className="h-7 w-7 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60"
          aria-label={t('cluster_map.reset_view')}
          title={t('cluster_map.reset_view')}
        >
          ⤾
        </button>
      </div>
      {/* preserveAspectRatio keeps the chart legible inside narrow
          parents (a side modal) — without it the SVG scales each axis
          independently and squishes everything flat. */}
      <svg
        ref={svgRef}
        viewBox={viewBox}
        // Fixed aspect ratio so the canvas has a predictable physical
        // size regardless of how many clusters there are. ``max-h``
        // caps total height on tall viewports; on narrow ones the
        // aspect-ratio rule dominates. ``preserveAspectRatio=meet``
        // centres the world inside the canvas with letterboxing.
        className={cn(
          'w-full aspect-[16/10] max-h-[72vh] touch-none select-none',
          dragRef.current ? 'cursor-grabbing' : 'cursor-grab',
        )}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={t('cluster_map.aria_label')}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {/* Background dot grid — quiet, doesn't fight the graph. */}
        <defs>
          <pattern
            id="dot-grid"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="12"
              cy="12"
              r="0.7"
              className="fill-muted-foreground/15"
            />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="url(#dot-grid)" />

        {/* Edges first so the nodes sit on top. */}
        {edges.map((e, i) => {
          const a = nodes.find((n) => n.submissionId === e.aId);
          const b = nodes.find((n) => n.submissionId === e.bId);
          if (!a || !b) return null;
          const line = (
            <line
              x1={a.cx}
              y1={a.cy}
              x2={b.cx}
              y2={b.cy}
              className={cn(EDGE_STROKE[e.tier], 'hover:opacity-80')}
              strokeWidth={EDGE_WIDTH[e.tier]}
              strokeLinecap="round"
            >
              <title>{`${a.label} ↔ ${b.label} — ${(
                e.pair.similarity * 100
              ).toFixed(1)}%`}</title>
            </line>
          );
          if (onPairClick) {
            return (
              <g
                key={`${e.pair.id}-${i}`}
                className="cursor-pointer"
                onClick={() => onPairClick(e.pair.id)}
              >
                {line}
              </g>
            );
          }
          return (
            <Link
              key={`${e.pair.id}-${i}`}
              to={`/plagiarism-runs/${runId}/pairs/${e.pair.id}`}
              className="cursor-pointer"
            >
              {line}
            </Link>
          );
        })}

        {/* Nodes. Label sits *outside* the ring, on the radial line
            from the cluster centre through the node, so labels can't
            collide with adjacent nodes inside a dense cluster.
            Lone nodes (no cluster) drop the label below as before. */}
        {nodes.map((n) => {
          const isFocus = n.submissionId === focusSubmissionId;
          const dx = n.cx - n.clusterCx;
          const dy = n.cy - n.clusterCy;
          const dist = Math.hypot(dx, dy);
          // Lone node (dist 0) → label below; clustered → label
          // pushed 30 px further out along the radial direction.
          const labelOffset = 30;
          const lx = dist > 0.5 ? n.cx + (dx / dist) * labelOffset : n.cx;
          const ly =
            dist > 0.5 ? n.cy + (dy / dist) * labelOffset + 4 : n.cy + 42;
          // Horizontal anchor by angle: text reads naturally on the
          // outward side without overlapping the node.
          const anchor =
            dist <= 0.5
              ? 'middle'
              : dx > 12
                ? 'start'
                : dx < -12
                  ? 'end'
                  : 'middle';
          return (
            <g key={n.submissionId} className="select-none">
              {isFocus && (
                // Soft "you are here" halo behind the focus node.
                <circle
                  cx={n.cx}
                  cy={n.cy}
                  r={28}
                  className="fill-primary/20 stroke-primary"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                />
              )}
              <circle
                cx={n.cx}
                cy={n.cy}
                r={18}
                className={cn(
                  isFocus ? 'stroke-primary' : 'stroke-border',
                  n.filled ? 'fill-foreground' : 'fill-background',
                  onNodeClick &&
                    'cursor-pointer transition-transform hover:scale-110',
                )}
                strokeWidth={isFocus ? 2.5 : 1.5}
                onClick={
                  onNodeClick
                    ? (e) => {
                        e.stopPropagation();
                        onNodeClick(n.submissionId);
                      }
                    : undefined
                }
                style={
                  onNodeClick
                    ? { transformBox: 'fill-box', transformOrigin: 'center' }
                    : undefined
                }
              >
                <title>
                  {onNodeClick
                    ? t('cluster_map.node_view_code', { name: n.label })
                    : n.label}
                </title>
              </circle>
              <text
                x={lx}
                y={ly}
                textAnchor={anchor}
                className={cn(
                  'text-[11px] font-medium pointer-events-none',
                  isFocus
                    ? 'fill-primary font-semibold'
                    : n.hasStrongEdge
                      ? 'fill-foreground/85'
                      : 'fill-muted-foreground',
                )}
                style={{ fontFamily: 'inherit' }}
              >
                {shortLabel(n.label)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Compact one-line legend — edge severities only. The "filled
          vs hollow" node distinction is hover-discoverable via the
          circle <title>; the gesture hint that used to live on the
          right was visual clutter — the +/−/⤾ buttons in the top-
          right corner already telegraph the zoom affordance. */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <LegendSwatch tone="bg-red-500" label="High match" />
        <LegendSwatch tone="bg-amber-500" label="Partial" />
        <LegendSwatch tone="bg-muted-foreground/40" label="Touches" />
      </div>
    </div>
  );
}

function LegendSwatch({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('inline-block h-0.5 w-5 rounded', tone)} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout — pure, deterministic, no force sim
// ---------------------------------------------------------------------------

interface BuiltLayout {
  nodes: NodeLayout[];
  edges: EdgeLayout[];
  width: number;
  height: number;
}

function buildLayout(
  pairs: PlagiarismPair[],
  clusters: PlagiarismCluster[],
): BuiltLayout {
  // 0. Drawable pairs first — only matches above the noise floor. Their
  //    endpoints are the *only* submissions that become nodes. A student
  //    whose every pair is sub-5 % noise simply isn't drawn (that's what
  //    killed the giant disconnected "outlier ring").
  const drawablePairs = pairs.filter(
    (p) => p.similarity >= MIN_EDGE_SIMILARITY,
  );
  const connectedIds = new Set<string>();
  for (const p of drawablePairs) {
    connectedIds.add(p.a_submission_id);
    connectedIds.add(p.b_submission_id);
  }

  // 1. Labels — only for submissions that have at least one drawable
  //    edge. Cluster members with no real pair are intentionally
  //    dropped: a cluster of weak touches carries no signal.
  const labels = new Map<string, string>();
  for (const p of drawablePairs) {
    labels.set(
      p.a_submission_id,
      p.a_author?.display_name || p.a_submission_id,
    );
    labels.set(
      p.b_submission_id,
      p.b_author?.display_name || p.b_submission_id,
    );
  }

  // 2. Decide which cluster index every node belongs to.
  //    The backend may or may not ship cluster rows: Dolos's adapter
  //    reports ``supports_clusters = False`` so the orchestrator writes
  //    none — without a synthetic fallback all 60-odd matched nodes
  //    pile up in a single ``outliers`` ring and the map becomes a
  //    spaghetti blob. When ``clusters`` is empty we run connected-
  //    components on the strong-match subgraph (similarity ≥
  //    PARTIAL_SIM) and treat each component as its own cluster. Pure
  //    "touches"-only links don't merge components — that's what the
  //    legacy outliers bucket exists for.
  const effectiveClusters: PlagiarismCluster[] =
    clusters.length > 0
      ? clusters
      : synthesiseClustersFromPairs(drawablePairs, connectedIds);

  const clusterOf = new Map<string, number>();
  effectiveClusters.forEach((c, i) => {
    for (const m of c.members) {
      if (connectedIds.has(m)) clusterOf.set(m, i);
    }
  });

  // 3. Bucket nodes: clustered ones go to their cluster's list, the rest
  // form a synthetic "outliers" group placed last on the right.
  const buckets: string[][] = effectiveClusters.map(() => []);
  const outliers: string[] = [];
  for (const id of labels.keys()) {
    const ci = clusterOf.get(id);
    if (ci == null) outliers.push(id);
    else buckets[ci].push(id);
  }
  // Drop empty buckets (clusters with no rendered pairs).
  const filledBuckets = buckets
    .map((nodes, idx) => ({ nodes, idx }))
    .filter((b) => b.nodes.length > 0);

  // 4. Track which submissions actually have a non-touches edge so we
  // can flag those nodes "filled" individually (legend: filled = real
  // match, hollow = touches-only / isolated).
  const strongConnected = new Set<string>();
  for (const p of pairs) {
    if (p.similarity >= PARTIAL_SIM) {
      strongConnected.add(p.a_submission_id);
      strongConnected.add(p.b_submission_id);
    }
  }

  // 5. Geometry — shelf-pack per-cluster cells (each sized to fit its
  // own ring + labels) instead of a uniform sqrt-grid. The previous
  // grid sized every cell to the *largest* cluster's footprint, so a
  // 60-member ring sitting next to a 2-member dyad blew the dyad's
  // cell up to the same dimensions and left huge expanses of dead
  // space (and the small clusters drifted hundreds of pixels apart).
  // Shelf-pack lays cells L→R, wraps when the running row width
  // exceeds the target — large clusters pin their row's height, small
  // ones nestle against each other inside the leftover horizontal
  // run.
  const placements: { ids: string[]; isOutlier: boolean; clusterIdx: number }[] =
    [];
  for (const bucket of filledBuckets) {
    placements.push({ ids: bucket.nodes, isOutlier: false, clusterIdx: bucket.idx });
  }
  if (outliers.length) {
    placements.push({ ids: outliers, isOutlier: true, clusterIdx: -1 });
  }

  // Per-cluster cell size — driven by the ring radius (which scales
  // with member count) plus enough margin for the radial label.
  const cellOf = (size: number): { w: number; h: number; ringR: number } => {
    if (size <= 1) return { w: 160, h: 130, ringR: 0 };
    const baseR = 35 + size * 6;
    // Cap so a single huge cluster doesn't run off the SVG; the rest
    // of the formula keeps small clusters genuinely small.
    const ringR = Math.min(baseR, 240);
    const pad = 110; // label band on each side
    const sz = Math.max(220, ringR * 2 + pad);
    return { w: sz, h: sz, ringR };
  };

  // Shelf-pack — pick a target width that scales with the biggest
  // cluster but doesn't run wider than ~3 large cells. Then wrap.
  const cells = placements.map((p) => cellOf(p.ids.length));
  const maxCellW = cells.reduce((m, c) => Math.max(m, c.w), 0);
  const padding = 30;
  const gap = 16;
  const targetRowW = Math.max(maxCellW * 2 + gap, 900);

  type CellLayout = {
    cx: number;
    cy: number;
    ringR: number;
    placement: typeof placements[number];
  };
  const cellLayouts: CellLayout[] = [];
  let curX = padding;
  let curY = padding;
  let rowMaxH = 0;
  let rowMaxW = 0;
  placements.forEach((p, i) => {
    const c = cells[i];
    // Wrap row when the next cell would push past the target width.
    if (curX > padding && curX + c.w > padding + targetRowW) {
      rowMaxW = Math.max(rowMaxW, curX);
      curX = padding;
      curY += rowMaxH + gap;
      rowMaxH = 0;
    }
    cellLayouts.push({
      cx: curX + c.w / 2,
      cy: curY + c.h / 2,
      ringR: c.ringR,
      placement: p,
    });
    curX += c.w + gap;
    rowMaxH = Math.max(rowMaxH, c.h);
  });
  rowMaxW = Math.max(rowMaxW, curX);
  const width = Math.max(640, rowMaxW + padding);
  const height = Math.max(360, curY + rowMaxH + padding);

  const nodes: NodeLayout[] = [];
  cellLayouts.forEach(({ cx, cy, ringR, placement }) => {
    placeOnCircle(placement.ids, cx, cy, ringR).forEach((pos, i) => {
      const id = placement.ids[i];
      nodes.push({
        submissionId: id,
        label: labels.get(id) ?? id,
        clusterIdx: placement.clusterIdx,
        cx: pos.x,
        cy: pos.y,
        clusterCx: cx,
        clusterCy: cy,
        // "filled" tone now signals "this dot has a real match", not
        // "the whole cluster is high". That's what the user actually
        // wants to spot at a glance — and the legend can describe.
        filled: strongConnected.has(id),
        hasStrongEdge: strongConnected.has(id),
      });
    });
  });

  // 6. Edges — ``drawablePairs`` is already filtered to >= 5 %
  // similarity (step 0); every endpoint is guaranteed to be a node, so
  // no extra membership check is needed.
  const edges: EdgeLayout[] = drawablePairs.map((p) => ({
    pair: p,
    tier: classifyTier(p.similarity),
    aId: p.a_submission_id,
    bId: p.b_submission_id,
  }));

  return { nodes, edges, width, height };
}

/**
 * Connected-components clustering fallback used when the backend ships
 * zero clusters (Dolos: ``supports_clusters=false``). Only edges with
 * similarity ≥ ``PARTIAL_SIM`` merge components — pure ``touches`` noise
 * doesn't, so weak matches don't dissolve the whole graph into one
 * giant blob. Singletons skip — they end up in the legacy outliers
 * bucket so the layout doesn't render a separate cell per isolated
 * student.
 */
function synthesiseClustersFromPairs(
  drawablePairs: PlagiarismPair[],
  connectedIds: Set<string>,
): PlagiarismCluster[] {
  const adj = new Map<string, Set<string>>();
  const touch = (id: string): Set<string> => {
    let s = adj.get(id);
    if (!s) {
      s = new Set();
      adj.set(id, s);
    }
    return s;
  };
  for (const id of connectedIds) touch(id);
  for (const p of drawablePairs) {
    if (p.similarity < PARTIAL_SIM) continue;
    touch(p.a_submission_id).add(p.b_submission_id);
    touch(p.b_submission_id).add(p.a_submission_id);
  }
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const seed of connectedIds) {
    if (visited.has(seed)) continue;
    const comp: string[] = [];
    const queue: string[] = [seed];
    while (queue.length > 0) {
      const v = queue.shift()!;
      if (visited.has(v)) continue;
      visited.add(v);
      comp.push(v);
      for (const next of adj.get(v) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
    // Singletons (no strong edge to anyone) → leave for outliers.
    if (comp.length >= 2) components.push(comp);
  }
  // Sort biggest-first so the layout's grid places the dominant
  // groups in the top-left, which the eye reaches first.
  components.sort((a, b) => b.length - a.length);
  return components.map(
    (members, i): PlagiarismCluster => ({
      id: `synth-${i}`,
      run_id: '',
      members,
      avg_similarity: 0,
      dominant_language: '',
    }),
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function placeOnCircle(
  ids: string[],
  cx: number,
  cy: number,
  r: number,
): Array<{ x: number; y: number }> {
  if (ids.length === 0) return [];
  if (ids.length === 1) return [{ x: cx, y: cy }];
  return ids.map((_id, i) => {
    const angle = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

export default ClusterMapView;
