/**
 * Federated global search + aggregated public profile.
 *
 * GET /api/v1/search fans out into course / assignment / person / submission
 * and returns a flat shape: { q, groups: [{ type, items, error? }] }.
 * GET /api/v1/profiles/{id} aggregates the public profile (card + courses +
 * viewer-visible submissions).
 */
import api from '../client';

export type SearchType = 'course' | 'assignment' | 'person' | 'submission';

export interface SearchResult {
  /** Stringified id of the underlying entity. */
  id: string;
  /** Human-readable label rendered in the palette. */
  title: string;
  /** Frontend route the palette should navigate to. */
  url: string;
  /** Secondary line (org for people; assignment·course·verdict for submissions). */
  subtitle?: string | null;
  /** Course only — slug used to build the course URL. */
  slug?: string;
  /** Assignment only — owning course id (kept for context badges). */
  course_id?: string | number;
  /** Person only — global role (student/teacher/…). */
  role?: string | null;
}

export interface SearchGroup {
  type: SearchType;
  items: SearchResult[];
  /** Total matches available server-side (may exceed items.length when the
   *  per-group cap is hit). Lets the UI show the real count + "show more". */
  total?: number;
  /** When the gateway captured a per-group failure we expose it instead of
   *  surfacing a global error. */
  error?: string;
}

export interface SearchResponse {
  q: string;
  groups: SearchGroup[];
}

// ---- Public profile -------------------------------------------------------

export interface ProfileCard {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  global_role: string;
  tenant_id: string;
  tenant_name?: string | null;
  tenant_slug?: string | null;
  created_at: string;
}

export interface ProfileCourseRef {
  id: string;
  name: string;
  slug: string;
  role: string;
}

export interface ProfileSubmissionRef {
  id: string;
  assignment_title?: string | null;
  homework_title?: string | null;
  course_name?: string | null;
  author_label?: string | null;
  external_verdict?: string | null;
  status?: string | null;
  language?: string | null;
  submitted_at?: string | null;
  score?: number | null;
  max_score?: number | null;
  is_graded?: boolean;
}

export interface ProfileFull {
  card: ProfileCard;
  courses: ProfileCourseRef[];
  submissions: ProfileSubmissionRef[];
}

export const searchApi = {
  /**
   * Global federated search.
   * @param q     query string (>= 2 chars enforced by the backend)
   * @param types optional comma-separated subset of SearchType
   * @param limit per-group result cap (1..20 in palette; up to 50 on the
   *              full results page)
   */
  global: (q: string, types?: string, limit = 5) =>
    api
      .get<SearchResponse>('/search', { params: { q, types, limit } })
      .then((r) => r.data),

  /** Aggregated public profile (card + courses + viewer-visible submissions). */
  profile: (userId: string) =>
    api.get<ProfileFull>(`/profiles/${encodeURIComponent(userId)}`).then((r) => r.data),
};
