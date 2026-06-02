/**
 * React-Query hooks for federated global search + public profiles.
 *
 * The search query is gated on the trimmed query reaching 2 characters
 * (and, in the palette, on the modal being open) — we don't issue requests
 * on every keystroke before they're needed.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  searchApi,
  type ProfileFull,
  type SearchResponse,
} from '@/api/endpoints/search';

export const searchKeys = {
  all: ['search'] as const,
  query: (q: string, limit: number) => ['search', q, limit] as const,
  profile: (id: string) => ['profile', id] as const,
};

interface UseGlobalSearchOptions {
  enabled?: boolean;
  /** Per-group cap. Palette uses the default (5); the full results page
   *  passes a larger value (e.g. 50). */
  limit?: number;
}

export function useGlobalSearch(q: string, opts: UseGlobalSearchOptions = {}) {
  const trimmed = q.trim();
  const limit = opts.limit ?? 5;
  return useQuery<SearchResponse>({
    queryKey: searchKeys.query(trimmed, limit),
    queryFn: () => searchApi.global(trimmed, undefined, limit),
    enabled: (opts.enabled ?? true) && trimmed.length >= 2,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useProfile(userId: string | undefined) {
  return useQuery<ProfileFull>({
    queryKey: searchKeys.profile(userId ?? ''),
    queryFn: () => searchApi.profile(userId as string),
    enabled: !!userId,
    staleTime: 30_000,
  });
}
