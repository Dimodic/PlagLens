/**
 * Federated global search — backed by GET /api/v1/search on the gateway.
 *
 * The gateway fans out into course / assignment / user services and returns a
 * flat shape: { q, groups: [{ type, items, error? }] }.
 */
import api from '../client';

export type SearchType = 'course' | 'assignment' | 'user';

export interface SearchResult {
  /** Stringified id of the underlying entity. */
  id: string;
  /** Human-readable label rendered in the palette. */
  title: string;
  /** Frontend route the palette should navigate to. */
  url: string;
  /** Course only — slug used to build the course URL. */
  slug?: string;
  /** Assignment only — owning course id (kept for context badges). */
  course_id?: string | number;
  /** User only — present so we can display the email under the name. */
  email?: string;
}

export interface SearchGroup {
  type: SearchType;
  items: SearchResult[];
  /** When the gateway captured a per-group failure we expose it instead of
   *  surfacing a global error. */
  error?: string;
}

export interface SearchResponse {
  q: string;
  groups: SearchGroup[];
}

export const searchApi = {
  /**
   * Global federated search.
   *
   * @param q     query string (>= 2 chars enforced by the backend)
   * @param types optional comma-separated subset of SearchType
   * @param limit per-group result cap (1..20)
   */
  global: (q: string, types?: string, limit = 5) =>
    api
      .get<SearchResponse>('/search', { params: { q, types, limit } })
      .then((r) => r.data),
};
