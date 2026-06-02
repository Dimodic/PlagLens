/**
 * Page-strip pagination (Yandex.Contest style: ‹ 1 2 3 … 10 ›).
 *
 * Pure controlled component — caller owns the page state. Backend should
 * return `pagination.total` so we can compute total pages; without `total`
 * this component falls back to a minimal prev/next.
 *
 * Page numbering is 1-based for display; the offset passed to the API is
 * ``(page - 1) * pageSize``.
 *
 * Design: minimal, no card chrome. Active page is a filled pill; inactive
 * pages are ghost buttons; ellipsis (…) collapses long ranges so we never
 * render more than ~9 page tokens at once. Following the project's
 * minimalism principle — no descriptions, just numbers.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/i18n';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';

interface PaginationProps {
  page: number; // 1-based
  pageSize: number;
  total: number | null | undefined;
  onPageChange: (page: number) => void;
  /** Hide entirely when there's only one page (default true). */
  hideOnSinglePage?: boolean;
}

/** Compute the visible page tokens — numbers + `'…'` ellipsis markers.
 *
 * Rules:
 *   - always show first + last
 *   - always show ±1 around the current page
 *   - collapse gaps to a single `'…'`
 *
 * For ≤7 pages we just enumerate them all.
 */
function computeTokens(current: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const tokens: (number | '…')[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(totalPages - 1, current + 1);
  if (left > 2) tokens.push('…');
  for (let p = left; p <= right; p++) tokens.push(p);
  if (right < totalPages - 1) tokens.push('…');
  tokens.push(totalPages);
  return tokens;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  hideOnSinglePage = true,
}: PaginationProps) {
  const { t } = useTranslation();
  // Pagers sit at the bottom of a list — jump back to the top on a page
  // change so the new page starts in view instead of leaving the reader
  // parked at the pager. Shared by every paginated list, so this is the
  // one place the "scroll to top on page change" behaviour lives.
  const change = (p: number) => {
    onPageChange(p);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
  // No total? Fall back to bare prev/next — we don't know how many pages
  // exist. This path is mostly for legacy cursor endpoints.
  if (total == null) {
    return (
      <div className="flex items-center justify-center gap-2 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => change(page - 1)}
          disabled={page <= 1}
          aria-label={t('common.back')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm tabular-nums text-muted-foreground">
          {page}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => change(page + 1)}
          aria-label={t('pagination.forward')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (hideOnSinglePage && totalPages <= 1) return null;
  const tokens = computeTokens(page, totalPages);
  return (
    <nav
      className="flex items-center justify-center gap-1 py-3"
      aria-label={t('pagination.nav_label')}
      data-testid="pagination"
    >
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label={t('pagination.prev_page')}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {tokens.map((token, i) =>
        token === '…' ? (
          <span
            key={`ellipsis-${i}`}
            className="px-2 text-sm text-muted-foreground select-none"
            aria-hidden
          >
            …
          </span>
        ) : (
          <Button
            key={token}
            type="button"
            variant={token === page ? 'default' : 'ghost'}
            className={cn(
              'h-8 min-w-8 px-2 tabular-nums text-sm',
              token === page && 'pointer-events-none',
            )}
            onClick={() => change(token)}
            aria-current={token === page ? 'page' : undefined}
            aria-label={t('pagination.page_n', { n: token })}
          >
            {token}
          </Button>
        ),
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label={t('pagination.next_page')}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}
