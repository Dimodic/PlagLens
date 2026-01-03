/**
 * React-Query hook for the federated global search endpoint.
 *
 * The query is gated on the trimmed query reaching 2 characters and the
 * palette being open — we don't want to issue requests on every keystroke
 * before the modal becomes visible.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { searchApi, type SearchResponse } from '@/api/endpoints/search';

export const searchKeys = {
  all: ['search'] as const,
  query: (q: string) => ['search', q] as const,
};

interface UseGlobalSearchOptions {
  enabled?: boolean;
}

export function useGlobalSearch(q: string, opts: UseGlobalSearchOptions = {}) {
  const trimmed = q.trim();
  return useQuery<SearchResponse>({
    queryKey: searchKeys.query(trimmed),
    queryFn: () => searchApi.global(trimmed),
    enabled: (opts.enabled ?? true) && trimmed.length >= 2,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}
