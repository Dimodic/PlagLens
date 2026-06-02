/**
 * SuspiciousGraph — a connection map for the «Подозрительные» tab. Students are
 * nodes; an edge is drawn between two students who share a flagged pair, with
 * width + colour encoding the peak similarity. Clicking a node highlights its
 * links (and dims the rest) so habitual-copying clusters pop out at a glance.
 *
 * No graph library: a tiny deterministic force simulation (seeded on a circle
 * by index — no RNG) runs once in a useMemo and we render plain SVG. For dense
 * courses only the strongest links are shown to keep it legible.
 */
import { useMemo, useState } from 'react';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

interface PairEdge {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  count: number;
  maxSim: number;
  runId: string | null;
}

interface Props {
  stats: PairEdge[];
  onOpenRun?: (runId: string) => void;
}

const W = 820;
const H = 440;
const PAD = 36;
const MAX_EDGES = 80;

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[1][0]}.`;
  return parts[0] ?? full;
}

function simStroke(s: number): string {
  if (s > 0.85) return 'stroke-sev-high';
  if (s >= 0.7) return 'stroke-sev-mid';
  return 'stroke-sev-low';
}

export function SuspiciousGraph({ stats, onOpenRun }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);

  const { nodes, edges, pos, capped, total } = useMemo(() => {
    const total = stats.length;
    const top = [...stats]
      .sort((a, b) => b.maxSim - a.maxSim || b.count - a.count)
      .slice(0, MAX_EDGES);

    const nodeMap = new Map<string, { id: string; name: string; deg: number }>();
    for (const e of top) {
      const a = nodeMap.get(e.aId) ?? { id: e.aId, name: e.aName, deg: 0 };
      a.deg += 1;
      nodeMap.set(e.aId, a);
      const b = nodeMap.get(e.bId) ?? { id: e.bId, name: e.bName, deg: 0 };
      b.deg += 1;
      nodeMap.set(e.bId, b);
    }
    const nodes = [...nodeMap.values()];
    const n = nodes.length || 1;

    // Deterministic seed: evenly spaced on a circle by index (no RNG).
    const px = new Array(n);
    const py = new Array(n);
    const idx = new Map<string, number>();
    nodes.forEach((nd, i) => {
      idx.set(nd.id, i);
      const ang = (2 * Math.PI * i) / n;
      px[i] = W / 2 + (W / 2 - PAD - 40) * Math.cos(ang);
      py[i] = H / 2 + (H / 2 - PAD - 20) * Math.sin(ang);
    });

    const REP = 2600;
    const L = 72;
    const KS = 0.04;
    const KG = 0.012;
    const ITER = 160;
    for (let it = 0; it < ITER; it++) {
      const fx = new Array(n).fill(0);
      const fy = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          let dx = px[i] - px[j];
          let dy = py[i] - py[j];
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) {
            dx = (i - j) || 1;
            dy = 1;
            d2 = dx * dx + dy * dy;
          }
          const d = Math.sqrt(d2);
          const f = REP / d2;
          fx[i] += (f * dx) / d;
          fy[i] += (f * dy) / d;
          fx[j] -= (f * dx) / d;
          fy[j] -= (f * dy) / d;
        }
      }
      for (const e of top) {
        const i = idx.get(e.aId)!;
        const j = idx.get(e.bId)!;
        const dx = px[j] - px[i];
        const dy = py[j] - py[i];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const ideal = L * (1.4 - e.maxSim); // stronger similarity → pulled closer
        const f = KS * (d - ideal);
        fx[i] += (f * dx) / d;
        fy[i] += (f * dy) / d;
        fx[j] -= (f * dx) / d;
        fy[j] -= (f * dy) / d;
      }
      for (let i = 0; i < n; i++) {
        fx[i] += (W / 2 - px[i]) * KG;
        fy[i] += (H / 2 - py[i]) * KG;
        px[i] += Math.max(-12, Math.min(12, fx[i]));
        py[i] += Math.max(-12, Math.min(12, fy[i]));
        px[i] = Math.max(PAD, Math.min(W - PAD, px[i]));
        py[i] = Math.max(PAD, Math.min(H - PAD, py[i]));
      }
    }

    const pos = new Map<string, { x: number; y: number }>();
    nodes.forEach((nd, i) => pos.set(nd.id, { x: px[i], y: py[i] }));
    return { nodes, edges: top, pos, capped: total > MAX_EDGES, total };
  }, [stats]);

  const neighborIds = useMemo(() => {
    if (!selected) return null;
    const s = new Set<string>([selected]);
    for (const e of edges) {
      if (e.aId === selected) s.add(e.bId);
      if (e.bId === selected) s.add(e.aId);
    }
    return s;
  }, [selected, edges]);

  if (nodes.length === 0) return null;

  const selNode = selected ? nodes.find((nd) => nd.id === selected) : null;
  const selDeg = selected
    ? edges.filter((e) => e.aId === selected || e.bId === selected).length
    : 0;

  return (
    <section className="space-y-3" data-testid="suspicious-graph">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {t('suspicious.map_title')}
        </h2>
        <span className="text-xs text-muted-foreground truncate">
          {selNode
            ? t('suspicious.map_degree', { name: selNode.name, count: selDeg })
            : t('suspicious.map_hint')}
        </span>
      </div>
      <div className="rounded-lg border border-border/60 bg-card/30">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[440px] w-full"
          onClick={() => setSelected(null)}
          role="img"
          aria-label={t('suspicious.map_title')}
        >
          {edges.map((e, i) => {
            const a = pos.get(e.aId)!;
            const b = pos.get(e.bId)!;
            const dim =
              neighborIds && !(neighborIds.has(e.aId) && neighborIds.has(e.bId));
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                className={cn(simStroke(e.maxSim), e.runId && 'cursor-pointer')}
                strokeOpacity={dim ? 0.05 : 0.25 + 0.5 * e.maxSim}
                strokeWidth={1 + 3 * e.maxSim}
                strokeLinecap="round"
                onClick={(ev) => {
                  ev.stopPropagation();
                  if (e.runId && onOpenRun) onOpenRun(e.runId);
                }}
              >
                <title>{`${e.aName} ↔ ${e.bName} · ${Math.round(e.maxSim * 100)}%`}</title>
              </line>
            );
          })}
          {nodes.map((nd) => {
            const p = pos.get(nd.id)!;
            const dim = neighborIds && !neighborIds.has(nd.id);
            const isSel = selected === nd.id;
            const r = 4 + Math.min(nd.deg, 7);
            const showLabel =
              !dim && (nd.deg >= 3 || isSel || (neighborIds?.has(nd.id) ?? false));
            return (
              <g
                key={nd.id}
                className="cursor-pointer"
                opacity={dim ? 0.25 : 1}
                onClick={(ev) => {
                  ev.stopPropagation();
                  setSelected(isSel ? null : nd.id);
                }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  className={cn(
                    'stroke-background',
                    isSel ? 'fill-primary' : 'fill-foreground',
                  )}
                  fillOpacity={isSel ? 1 : 0.85}
                  strokeWidth={1.5}
                />
                {showLabel && (
                  <text
                    x={p.x}
                    y={p.y - r - 3}
                    textAnchor="middle"
                    className="pointer-events-none fill-foreground"
                    fontSize={10}
                  >
                    {shortName(nd.name)}
                  </text>
                )}
                <title>{nd.name}</title>
              </g>
            );
          })}
        </svg>
      </div>
      {capped && (
        <p className="text-xs text-muted-foreground">
          {t('suspicious.map_capped', { shown: edges.length, total })}
        </p>
      )}
    </section>
  );
}

export default SuspiciousGraph;
