/**
 * Generic cursor-paginated list shell.
 * Children receive flat items + sentinel "Load more" button.
 */
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Paginated } from '@/api/types';

interface CursorPaginatedProps<T> {
  queryKey: QueryKey;
  fetchPage: (cursor: string | null) => Promise<Paginated<T>>;
  children: (items: T[]) => ReactNode;
  emptyState?: ReactNode;
}

export function CursorPaginated<T>({
  queryKey,
  fetchPage,
  children,
  emptyState,
}: CursorPaginatedProps<T>) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      fetchPage((pageParam as string | null) ?? null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) =>
      last.pagination.has_more ? last.pagination.next_cursor : null,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  if (items.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="flex flex-col gap-3">
      {children(items)}
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            onClick={() => query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Загрузить ещё
          </Button>
        </div>
      )}
    </div>
  );
}
