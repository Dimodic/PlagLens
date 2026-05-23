/**
 * Shared API types — match backend contracts (RFC 7807 problems, cursor pagination, etc.).
 */

// ---------- RFC 7807 ----------
export interface ProblemFieldError {
  field: string;
  code: string;
  message: string;
}

export interface Problem {
  type?: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  code: string;
  errors?: ProblemFieldError[];
  request_id?: string;
  // Server may include extra problem-specific extensions:
  [key: string]: unknown;
}

// ---------- Pagination ----------
export interface PaginationMeta {
  next_cursor: string | null;
  has_more: boolean;
  limit: number;
  // Offset-pagination fields; present when the endpoint supports numbered
  // page navigation (Yandex-style). Optional so cursor-only endpoints
  // don't need to populate them.
  offset?: number;
  total?: number | null;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ---------- Operations (async resource) ----------
export type OperationStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface OperationProgress {
  completed: number;
  total: number;
  percent: number;
}

export interface Operation {
  id: string;
  kind: string;
  status: OperationStatus;
  progress: OperationProgress | null;
  started_at: string | null;
  updated_at: string | null;
  finished_at: string | null;
  result_url: string | null;
  error: Problem | null;
  metadata: Record<string, unknown>;
}

// ---------- Roles ----------
export type GlobalRole = 'admin' | 'teacher' | 'assistant' | 'student';
export type CourseRole = 'owner' | 'co_owner' | 'assistant' | 'student';

// ---------- User / tenant ----------
export interface TenantBrief {
  id: string;
  slug: string;
  name: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  locale: string;
  timezone: string | null;
  global_role: GlobalRole;
  course_roles: Record<string, CourseRole>;
  tenant: TenantBrief;
  email_verified: boolean;
  two_factor_enabled: boolean;
  linked_oauth: string[];
  last_login_at: string | null;
}

export interface UserSummary {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  global_role: GlobalRole;
  tenant_id: string;
}

// ---------- Auth ----------
export interface LoginResponse {
  access_token: string;
  expires_in: number;
  user: UserSummary;
}

export interface RefreshResponse {
  access_token: string;
  expires_in: number;
}

export interface RegisterResponse {
  user_id: string;
  email_verification_required: boolean;
}

// MFA-required problem (returned as 401 with code TWO_FACTOR_REQUIRED)
export interface MfaRequiredProblem extends Problem {
  code: 'TWO_FACTOR_REQUIRED';
  mfa_token?: string;
}

export type OAuthProvider = 'google' | 'yandex' | 'stepik' | 'github';
