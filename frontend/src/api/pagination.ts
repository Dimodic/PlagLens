/**
 * Cursor / offset pagination helpers.
 * Backend envelope: { data: T[], pagination: { next_cursor, has_more, limit, offset?, total? } }
 *
 * Submission-service supports both cursor (next-only) and offset pagination
 * on the same endpoints. Pass ``offset`` for numbered page UIs (1 2 3 4 …),
 * ``cursor`` for infinite-scroll. ``total`` is always returned by endpoints
 * that support offset paging, so the UI can render the full page strip.
 */
import type { Paginated } from './types';

export interface ListParams {
  cursor?: string | null;
  offset?: number;
  limit?: number;
  sort?: string;
  q?: string;
}

export function buildListParams(p: ListParams): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (p.cursor) out.cursor = p.cursor;
  if (p.offset !== undefined && p.offset > 0) out.offset = p.offset;
  if (p.limit) out.limit = p.limit;
  if (p.sort) out.sort = p.sort;
  if (p.q) out.q = p.q;
  return out;
}

/** Flatten pages from useInfiniteQuery into a single array. */
export function flattenPages<T>(pages: Paginated<T>[] | undefined): T[] {
  if (!pages) return [];
  return pages.flatMap((p) => p.data);
}
