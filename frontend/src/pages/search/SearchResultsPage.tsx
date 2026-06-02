/**
 * /search?q=… — full global search results, grouped into category tabs
 * (Всё / Люди / Посылки / Курсы / Задания). Backed by the same federated
 * gateway endpoint as the ⌘K palette, with a larger per-group cap. Scoped
 * server-side to what the current user may see.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BookOpen,
  FileCode2,
  FileText,
  Loader2,
  Search as SearchIcon,
  User as UserIcon,
} from 'lucide-react';
import { Page, PageHeader } from '@/components/layout/Page';
import { Input } from '@/components/ui/input';
import { RoleBadge } from '@/components/common/RoleBadge';
import { cn } from '@/components/ui/utils';
import { useGlobalSearch } from '@/hooks/api/useSearch';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { SearchGroup, SearchResult, SearchType } from '@/api/endpoints/search';

type Tab = 'all' | SearchType;

const TAB_ORDER: SearchType[] = ['person', 'submission', 'course', 'assignment'];

function typeIcon(type: SearchType) {
  const cls = 'h-4 w-4 text-muted-foreground';
  if (type === 'course') return <BookOpen className={cls} />;
  if (type === 'assignment') return <FileText className={cls} />;
  if (type === 'submission') return <FileCode2 className={cls} />;
  return <UserIcon className={cls} />;
}

function hrefFor(type: SearchType, r: SearchResult): string {
  if (type === 'course') return r.slug ? `/courses/${r.slug}` : `/courses/${r.id}`;
  if (type === 'assignment') return `/assignments/${r.id}`;
  if (type === 'submission') return `/submissions/${r.id}`;
  return `/u/${r.id}`;
}

function ResultRow({ type, r }: { type: SearchType; r: SearchResult }) {
  return (
    <Link
      to={hrefFor(type, r)}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent"
      data-testid={`search-result-${type}-${r.id}`}
    >
      {typeIcon(type)}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{r.title || '—'}</div>
        {r.subtitle && (
          <div className="truncate text-xs text-muted-foreground">{r.subtitle}</div>
        )}
      </div>
      {type === 'person' && r.role && <RoleBadge role={r.role} className="flex-none" />}
    </Link>
  );
}

export default function SearchResultsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const urlQ = params.get('q') ?? '';
  const [draft, setDraft] = useState(urlQ);
  const [tab, setTab] = useState<Tab>('all');
  // Per-group server cap; "Показать ещё" raises it (gateway caps at 200).
  const [limit, setLimit] = useState(50);
  const tabLabel = (type: SearchType) => t(`search_results.tab_${type}`);
  useDocumentTitle(
    urlQ ? t('search_results.doc_title_query', { q: urlQ }) : t('search_results.doc_title'),
  );

  // Keep the input in sync if the URL changes from elsewhere (e.g. palette).
  // A new query also resets paging back to the first window.
  useEffect(() => {
    setDraft(urlQ);
    setLimit(50);
  }, [urlQ]);

  // Push the draft into the URL (debounced) so the query + back-button work.
  useEffect(() => {
    const id = setTimeout(() => {
      if (draft.trim() !== urlQ) {
        setParams(draft.trim() ? { q: draft.trim() } : {}, { replace: true });
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const { data, isFetching } = useGlobalSearch(urlQ, { limit });

  const groups: SearchGroup[] = useMemo(() => {
    const list = (data?.groups ?? []) as SearchGroup[];
    const byType = new Map(list.map((g) => [g.type, g]));
    return TAB_ORDER.map(
      (tp) => byType.get(tp) ?? { type: tp, items: [] as SearchResult[], total: 0 },
    );
  }, [data]);

  // Real server-side totals (may exceed the loaded items when the cap is hit).
  const totals = useMemo(
    () => Object.fromEntries(groups.map((g) => [g.type, g.total ?? g.items.length])),
    [groups],
  ) as Record<SearchType, number>;
  const grandTotal = TAB_ORDER.reduce((n, tp) => n + (totals[tp] ?? 0), 0);

  const visibleGroups =
    tab === 'all' ? groups : groups.filter((g) => g.type === tab);

  return (
    <Page width="regular">
      <PageHeader title={t('search_results.title')} />

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          placeholder={t('search_results.search_placeholder')}
          className="pl-9"
          data-testid="search-page-input"
        />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-border/60">
        {(['all', ...TAB_ORDER] as Tab[]).map((tp) => {
          const label = tp === 'all' ? t('search_results.tab_all') : tabLabel(tp as SearchType);
          const count = tp === 'all' ? grandTotal : totals[tp as SearchType] ?? 0;
          return (
            <button
              key={tp}
              type="button"
              onClick={() => setTab(tp)}
              className={cn(
                'relative px-3 py-2 text-sm transition-colors',
                tab === tp
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`search-tab-${tp}`}
            >
              {label}
              {count > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">{count}</span>
              )}
              {tab === tp && (
                <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
        {isFetching && (
          <Loader2 className="ml-auto mr-2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Results */}
      {urlQ.trim().length < 2 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t('search_results.min_chars')}
        </p>
      ) : grandTotal === 0 && !isFetching ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t('search_results.empty', { q: urlQ })}
        </p>
      ) : (
        <div className="space-y-6">
          {visibleGroups.map((g) =>
            g.items.length === 0 ? null : (
              <section key={g.type} className="space-y-1">
                {tab === 'all' && (
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {tabLabel(g.type)}
                      <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">
                        {totals[g.type]}
                      </span>
                    </h2>
                    {totals[g.type] > 6 && (
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => setTab(g.type)}
                      >
                        {t('search_results.more_count', { count: totals[g.type] - 6 })}
                      </button>
                    )}
                  </div>
                )}
                <div className="flex flex-col">
                  {(tab === 'all' ? g.items.slice(0, 6) : g.items).map((r) => (
                    <ResultRow key={`${g.type}-${r.id}`} type={g.type} r={r} />
                  ))}
                </div>
                {/* Load-more / cap hint — only in a focused tab. */}
                {tab !== 'all' && (g.total ?? 0) > g.items.length && (
                  <div className="pt-2 text-center">
                    {limit < 200 ? (
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline disabled:opacity-50"
                        onClick={() => setLimit((l) => Math.min(l + 50, 200))}
                        disabled={isFetching}
                      >
                        {t('search_results.load_more')}
                      </button>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {t('search_results.cap_hint', { shown: g.items.length, total: g.total ?? 0 })}
                      </p>
                    )}
                  </div>
                )}
                {g.error && (
                  <p className="px-3 text-xs text-sev-mid">
                    {t('search_results.partial_unavailable')}
                  </p>
                )}
              </section>
            ),
          )}
        </div>
      )}
    </Page>
  );
}
