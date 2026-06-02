/**
 * SuspiciousPanel — inline-tab panel for the «Подозрительные» tab on
 * the course page.
 *
 * Top of the panel: small cluster map synthesised from the flag
 * `paired_with` pairs so a teacher can scan the whole course's
 * suspected-copy network at a glance, then jump to a specific row
 * below for actions. The list under it is one flat row per flag —
 * severity dot, "ФИО → совпало с ФИО (sim%)", date, actions on hover.
 * The backend's course-list endpoint enriches every flag with author
 * info for the row's submission AND for each peer in `paired_with`,
 * so we never need to fall back to opaque `sub_*` IDs in practice.
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  ChevronUp,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { cn } from '@/components/ui/utils';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { SimilarityBar } from '@/components/plagiarism/SimilarityBar';
import { Button } from '@/components/ui/button';
import {
  useDismissFlag,
  useSetFlagSeverity,
  useSuspiciousSubmissions,
} from '@/hooks/api/usePlagiarism';
import { useUsers } from '@/hooks/api/useUsers';
import { useNotifications } from '@/hooks/useNotifications';
import { t as translate, useTranslation } from '@/i18n';
import type {
  FlagSeverity,
  SuspiciousSubmission,
} from '@/api/endpoints/plagiarism';
import type { Problem } from '@/api/types';

dayjs.locale('ru');

const SEVERITY_DOT: Record<FlagSeverity, string> = {
  low: 'bg-sev-low',
  medium: 'bg-sev-mid',
  high: 'bg-sev-high',
};

const SEVERITY_KEY: Record<FlagSeverity, string> = {
  low: 'suspicious.severity_low',
  medium: 'suspicious.severity_medium',
  high: 'suspicious.severity_high',
};

type DismissedFilter = 'active' | 'dismissed' | 'all';

interface SuspiciousPanelProps {
  /** Course slug *or* id — the endpoint resolves both. */
  courseId: string;
}

export function SuspiciousPanel({ courseId }: SuspiciousPanelProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const [severity, setSeverity] = useState<FlagSeverity | ''>('');
  const [dismissed, setDismissed] = useState<DismissedFilter>('active');

  const { data, isLoading, error } = useSuspiciousSubmissions(courseId, {
    severity: severity || undefined,
    dismissed,
  });
  const { data: usersPage } = useUsers({ limit: 200 });
  const userById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of usersPage?.data ?? []) {
      const name = u.display_name?.trim();
      if (name) m.set(u.id, name);
    }
    return m;
  }, [usersPage?.data]);
  const dismissMut = useDismissFlag();
  const sevMut = useSetFlagSeverity();

  const handleDismiss = async (subId: string, flagId: string) => {
    try {
      await dismissMut.mutateAsync({
        submissionId: subId,
        flagId,
        reason: 'manual review',
      });
      notify.success(t('suspicious.notify_dismissed'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('suspicious.notify_dismiss_error'));
    }
  };

  const handleBumpSeverity = async (
    subId: string,
    flagId: string,
    current: FlagSeverity,
  ) => {
    const next: FlagSeverity =
      current === 'low' ? 'medium' : current === 'medium' ? 'high' : 'high';
    try {
      await sevMut.mutateAsync({
        submissionId: subId,
        flagId,
        severity: next,
      });
      notify.success(t('suspicious.notify_severity_updated'));
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? t('suspicious.notify_update_error'));
    }
  };

  const rows = data?.data ?? [];

  return (
    <div className="space-y-10" data-testid="suspicious-panel">
      {/* Top repeat-offender pairs — the one number a teacher actually
          asks: "кто у кого чаще списывает". */}
      {rows.length > 0 && <TopPairs rows={rows} userById={userById} />}

      {/* Full flag list. The separating rule only makes sense when there's a
          leaderboard above it — when the panel is empty the rule would stack
          right under the tab divider and read as a stray second line. */}
      <section
        className={`space-y-4 ${
          rows.length > 0 ? 'border-t border-border/60 pt-6' : ''
        }`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {t('suspicious.all_flags')}
          </h2>
          {!isLoading && rows.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t(pluralFlagKey(rows.length), { count: rows.length })}
            </span>
          )}
        </div>

        {/* Filter strip */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <FilterGroup
            label={t('suspicious.filter_severity')}
            value={severity || 'all'}
            onChange={(v) => setSeverity((v === 'all' ? '' : v) as FlagSeverity | '')}
            options={[
              { value: 'all', label: t('suspicious.filter_all') },
              { value: 'low', label: t('suspicious.severity_low') },
              { value: 'medium', label: t('suspicious.severity_medium') },
              { value: 'high', label: t('suspicious.severity_high') },
            ]}
            testId="suspicious-severity-filter"
          />
          <FilterGroup
            label={t('suspicious.filter_status')}
            value={dismissed}
            onChange={(v) => setDismissed(v as DismissedFilter)}
            options={[
              { value: 'active', label: t('suspicious.status_active') },
              { value: 'dismissed', label: t('suspicious.status_dismissed') },
              { value: 'all', label: t('suspicious.filter_all') },
            ]}
            testId="suspicious-dismissed-filter"
          />
        </div>

        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              dismissed === 'dismissed'
                ? t('suspicious.empty_dismissed')
                : t('suspicious.empty_active')
            }
          />
        ) : (
          <div
            className="flex flex-col divide-y divide-border/60"
            data-testid="suspicious-list"
          >
            {rows.map((s) => (
              <Row
                key={s.flag_id}
                s={s}
                authorName={resolveAuthor(s, userById)}
                peerNames={resolvePeers(s, userById)}
                onBump={() =>
                  void handleBumpSeverity(
                    s.submission_id,
                    s.flag_id,
                    s.severity,
                  )
                }
                onDismiss={() =>
                  void handleDismiss(s.submission_id, s.flag_id)
                }
                bumpPending={sevMut.isPending}
                dismissPending={dismissMut.isPending}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Row                                                                */

interface RowProps {
  s: SuspiciousSubmission;
  authorName: string;
  peerNames: string[];
  onBump: () => void;
  onDismiss: () => void;
  bumpPending: boolean;
  dismissPending: boolean;
}

function Row({
  s,
  authorName,
  peerNames,
  onBump,
  onDismiss,
  bumpPending,
  dismissPending,
}: RowProps) {
  const { t } = useTranslation();
  // Show up to 2 peer names; if more, append "+N".
  const visiblePeers = peerNames.slice(0, 2);
  const extraPeers = Math.max(peerNames.length - visiblePeers.length, 0);
  return (
    <div
      data-testid={`suspicious-row-${s.flag_id}`}
      className="group flex items-center gap-3 py-3"
    >
      <span
        title={t(SEVERITY_KEY[s.severity])}
        className={cn(
          'h-2 w-2 flex-none rounded-full',
          SEVERITY_DOT[s.severity],
        )}
        aria-label={t('suspicious.severity_aria', {
          level: t(SEVERITY_KEY[s.severity]),
        })}
        data-testid={`suspicious-row-${s.flag_id}-severity`}
      />

      {/* Main column: ФИО → совпало с ФИО · дата */}
      <div className="min-w-0 flex-1 flex items-baseline gap-2 text-sm">
        <span className="font-medium text-foreground truncate">{authorName}</span>
        {visiblePeers.length > 0 && (
          <>
            <ArrowRight
              className="h-3 w-3 flex-none text-muted-foreground/70"
              aria-hidden
            />
            <span className="min-w-0 truncate text-muted-foreground">
              {visiblePeers.join(', ')}
              {extraPeers > 0 && ` +${extraPeers}`}
            </span>
          </>
        )}
        <span className="text-muted-foreground/40 mx-1" aria-hidden>
          ·
        </span>
        <span className="text-muted-foreground tabular-nums">
          {dayjs(s.created_at).format('D MMM')}
        </span>
        {s.cleared_at && (
          <span className="ml-1 text-muted-foreground italic">
            {t('suspicious.cleared')}
          </span>
        )}
      </div>

      {/* Similarity bar with its own % label */}
      <div className="hidden sm:flex flex-none items-center justify-end w-40">
        {s.similarity != null ? (
          <SimilarityBar value={s.similarity} size="sm" width={120} />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Actions on hover */}
      <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('suspicious.bump')}
          title={t('suspicious.bump')}
          disabled={s.severity === 'high' || bumpPending}
          onClick={onBump}
          data-testid={`suspicious-row-${s.flag_id}-bump`}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        {!s.cleared_at && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
            aria-label={t('suspicious.dismiss')}
            title={t('suspicious.dismiss')}
            disabled={dismissPending}
            onClick={onDismiss}
            data-testid={`suspicious-row-${s.flag_id}-dismiss`}
          >
            {dismissPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
          </Button>
        )}
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('suspicious.open_submission')}
          title={t('suspicious.open_submission')}
        >
          <Link to={`/submissions/${s.submission_id}`}>
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Top repeat-offender pairs                                          */
/*                                                                    */
/* Aggregates flags by ordered author pair (Студент A ↔ Студент B)    */
/* and ranks pairs by number of times they've co-appeared in a flag.  */
/* Two-shared-flags+ is a much stronger signal than one isolated      */
/* 95 % match — the latter could be coincidence, the former is        */
/* almost certainly habitual copying. Click jumps to the most-recent  */
/* underlying plagiarism run for that pair.                           */

interface TopPairsProps {
  rows: SuspiciousSubmission[];
  userById: Map<string, string>;
}

interface PairStat {
  aId: string;
  aName: string;
  bId: string;
  bName: string;
  count: number;
  avgSim: number;
  maxSim: number;
  runId: string | null;
}

function TopPairs({ rows, userById }: TopPairsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const stats = useMemo(
    () => buildPairStats(rows, userById),
    [rows, userById],
  );

  if (stats.length === 0) return null;

  // Show top 5 by default — keeps the screen tight.
  const top = stats.slice(0, 5);
  const totalPairs = stats.length;

  return (
    <section data-testid="suspicious-top-pairs" className="space-y-4">
      {/* Matched in weight with the «Все флаги» heading below so the
          two sections clearly read as peer zones, not as one
          continuous list. */}
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">
          {t('suspicious.repeat_pairs')}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t(pluralPairKey(totalPairs), { count: totalPairs })}
        </span>
      </div>
      <ol className="flex flex-col divide-y divide-border/60">
        {top.map((p, i) => (
          <li
            key={`${p.aId}|${p.bId}`}
            className={cn(
              'group flex items-center gap-3 py-2.5',
              p.runId && 'cursor-pointer',
            )}
            onClick={() => p.runId && navigate(`/plagiarism-runs/${p.runId}`)}
            data-testid={`top-pair-${i}`}
          >
            <span className="w-5 flex-none text-xs tabular-nums text-muted-foreground/70 text-right">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 flex items-baseline gap-2 text-sm">
              <span className="font-medium text-foreground truncate">
                {p.aName}
              </span>
              <span
                aria-hidden
                className="flex-none text-muted-foreground/60 text-xs"
              >
                ↔
              </span>
              <span className="font-medium text-foreground truncate">
                {p.bName}
              </span>
            </div>
            {/* Compact meta — single short token («×10») instead of
                the verbose "10 совпадений · ср. 78%" that wrapped.
                Extra right margin keeps it clear of the bar. */}
            <span className="hidden md:inline flex-none text-xs tabular-nums text-muted-foreground w-10 mr-3 text-right">
              ×{p.count}
            </span>
            <div className="hidden sm:flex flex-none items-center justify-end w-44">
              <SimilarityBar value={p.maxSim} size="sm" width={100} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function buildPairStats(
  rows: SuspiciousSubmission[],
  userById: Map<string, string>,
): PairStat[] {
  const map = new Map<string, PairStat & { simSum: number }>();
  for (const r of rows) {
    const aId = r.author_id ?? r.author?.id ?? r.submission_id;
    const aName = resolveAuthor(r, userById);
    for (const peer of r.paired_with_authors ?? []) {
      const bIdRaw = peer.author_id ?? peer.submission_id;
      if (aId === bIdRaw) continue;
      const bName =
        (peer.author_id && userById.get(peer.author_id)) ||
        peer.display_name?.trim() ||
        shortSubLabel(peer.submission_id);
      // Canonical order so (A,B) and (B,A) collapse to the same entry.
      const [k1, n1, k2, n2] =
        aId < bIdRaw
          ? [aId, aName, bIdRaw, bName]
          : [bIdRaw, bName, aId, aName];
      const key = `${k1}|${k2}`;
      const sim = r.similarity ?? 0;
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        existing.simSum += sim;
        existing.maxSim = Math.max(existing.maxSim, sim);
        // Prefer keeping the most-recent run_id (rows arrive sorted
        // newest-first from the backend by default).
        existing.runId = existing.runId ?? r.run_id ?? null;
      } else {
        map.set(key, {
          aId: k1,
          aName: n1,
          bId: k2,
          bName: n2,
          count: 1,
          simSum: sim,
          avgSim: sim,
          maxSim: sim,
          runId: r.run_id ?? null,
        });
      }
    }
  }
  return Array.from(map.values())
    .map((p) => ({
      aId: p.aId,
      aName: p.aName,
      bId: p.bId,
      bName: p.bName,
      count: p.count,
      avgSim: p.simSum / p.count,
      maxSim: p.maxSim,
      runId: p.runId,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.maxSim - a.maxSim;
    });
}

function pluralPairKey(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'suspicious.pairs_many';
  if (mod10 === 1) return 'suspicious.pairs_one';
  if (mod10 >= 2 && mod10 <= 4) return 'suspicious.pairs_few';
  return 'suspicious.pairs_many';
}

/* ----------------------------------------------------------------- */
/* Helpers                                                            */

function resolveAuthor(
  s: SuspiciousSubmission,
  userById: Map<string, string>,
): string {
  const lookupId = s.author_id ?? s.author?.id ?? undefined;
  if (lookupId) {
    const fromMap = userById.get(lookupId);
    if (fromMap) return fromMap;
  }
  const backendName =
    s.author_display_name?.trim() || s.author?.display_name?.trim();
  if (backendName) return backendName;
  return shortSubLabel(s.submission_id);
}

function resolvePeers(
  s: SuspiciousSubmission,
  userById: Map<string, string>,
): string[] {
  const out: string[] = [];
  for (const p of s.paired_with_authors ?? []) {
    const fromMap = p.author_id ? userById.get(p.author_id) : undefined;
    if (fromMap) {
      out.push(fromMap);
      continue;
    }
    const name = p.display_name?.trim();
    if (name) {
      out.push(name);
      continue;
    }
    out.push(shortSubLabel(p.submission_id));
  }
  return out;
}

function shortSubLabel(submissionId: string): string {
  const tail = submissionId.replace(/^sub_/, '').slice(-4);
  return translate('suspicious.student_fallback', { tail });
}

function pluralFlagKey(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'suspicious.flags_many';
  if (mod10 === 1) return 'suspicious.flags_one';
  if (mod10 >= 2 && mod10 <= 4) return 'suspicious.flags_few';
  return 'suspicious.flags_many';
}

/* ----------------------------------------------------------------- */
/* Filter group                                                       */

interface FilterGroupProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testId?: string;
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
  testId,
}: FilterGroupProps) {
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      {/* Inline filter prefix — sentence-case, same size as the
          options, not a "screaming" uppercase section header. */}
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'text-sm transition-colors',
              value === opt.value
                ? 'font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={value === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SuspiciousPanel;
