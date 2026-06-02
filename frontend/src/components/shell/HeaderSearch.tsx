/**
 * HeaderSearch — inline global search that lives IN the header bar.
 *
 * Replaces the old centered ⌘K command palette (a dimmed modal with a
 * "quick actions" section). Per the request: no backdrop dimming, no quick
 * actions — just the search field where it already sits, with a results
 * dropdown anchored directly under it.
 *
 *   • Type ≥ 2 chars → federated GET /api/v1/search; groups
 *     (Люди / Посылки / Курсы / Задания) render hairline-free.
 *   • A pinned «Все результаты» row opens the full page (/search?q=…); Enter
 *     does the same.
 *   • ⌘K / Ctrl+K focuses the field (kept for muscle memory).
 *   • Click-outside / Esc closes the dropdown.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  FileCode2,
  FileText,
  Search,
  User as UserIcon,
} from 'lucide-react';
import { useTranslation } from '@/i18n';
import { useGlobalSearch } from '@/hooks/api/useSearch';
import { RoleBadge } from '@/components/common/RoleBadge';
import type { SearchGroup, SearchType } from '@/api/endpoints/search';

const TYPE_ORDER: SearchType[] = ['person', 'submission', 'course', 'assignment'];

const TYPE_LABEL_KEY: Record<SearchType, string> = {
  person: 'cmdk.group.users',
  submission: 'cmdk.group.submissions',
  course: 'cmdk.group.courses',
  assignment: 'cmdk.group.assignments',
};

function typeIcon(type: SearchType) {
  if (type === 'course')
    return <BookOpen className="h-4 w-4 text-muted-foreground" />;
  if (type === 'assignment')
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  if (type === 'submission')
    return <FileCode2 className="h-4 w-4 text-muted-foreground" />;
  return <UserIcon className="h-4 w-4 text-muted-foreground" />;
}

function buildHref(type: SearchType, id: string, slug?: string): string {
  if (type === 'course') return slug ? `/courses/${slug}` : `/courses/${id}`;
  if (type === 'assignment') return `/assignments/${id}`;
  if (type === 'submission') return `/submissions/${id}`;
  return `/u/${id}`;
}

export function HeaderSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const { data, isFetching } = useGlobalSearch(query, {
    enabled: open && hasQuery,
  });

  const groups: SearchGroup[] = useMemo(() => {
    const list = (data?.groups ?? []) as SearchGroup[];
    return [...list]
      .filter((g) => g.items.length > 0)
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  }, [data]);

  const go = useCallback(
    (to: string) => {
      navigate(to);
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    },
    [navigate],
  );

  const seeAll = useCallback(() => {
    if (trimmed) go(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [go, trimmed]);

  // ⌘K / Ctrl+K focuses the field (replaces the old palette open). Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Click outside closes the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const showDropdown = open && hasQuery;

  return (
    <div ref={wrapRef} className="pointer-events-auto relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            seeAll();
          }
        }}
        placeholder={t('shell.search_placeholder')}
        aria-label={t('shell.search_placeholder')}
        data-testid="header-search-input"
        className="h-9 w-full rounded-full border border-transparent bg-input-background pl-10 pr-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-ring"
      />

      {showDropdown && (
        <div
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg"
          data-testid="header-search-results"
        >
          {/* Pinned «Все результаты» — Enter / click opens the full page. */}
          <button
            type="button"
            onClick={seeAll}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            data-testid="header-search-see-all"
          >
            <Search className="h-4 w-4 text-primary" />
            <span className="flex-1 truncate">
              {t('cmdk.see_all', { query: trimmed })}
            </span>
            <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">
              ↵
            </kbd>
          </button>

          {isFetching && groups.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {t('cmdk.loading')}
            </div>
          ) : groups.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {t('cmdk.no_results')}
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.type} className="pt-1">
                <div className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                  {t(TYPE_LABEL_KEY[g.type])}
                </div>
                {g.items.map((r) => (
                  <button
                    key={`${g.type}-${r.id}`}
                    type="button"
                    onClick={() => go(buildHref(g.type, r.id, r.slug))}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                    data-testid={`header-search-result-${g.type}-${r.id}`}
                  >
                    {typeIcon(g.type)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.title}</div>
                      {r.subtitle && (
                        <div className="truncate text-xs text-muted-foreground">
                          {r.subtitle}
                        </div>
                      )}
                    </div>
                    {g.type === 'person' && r.role && (
                      <RoleBadge role={r.role} className="flex-none" />
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default HeaderSearch;
