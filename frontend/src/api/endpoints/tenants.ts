/**
 * Tenants — Identity Service §F.
 */
import api from '../client';
import type { Paginated, TenantBrief } from '../types';
import { buildListParams, type ListParams } from '../pagination';

export type TenantStatus = 'active' | 'suspended';

export interface TenantSettings {
  cors_origins?: string[];
  default_plagiarism_provider?: string | null;
  default_ai_provider?: string | null;
  data_retention_days?: number;
  [key: string]: unknown;
}

export interface Tenant extends TenantBrief {
  status: TenantStatus;
  domain?: string | null;
  settings: TenantSettings;
  cors_origins: string[];
  users_count?: number;
  courses_count?: number;
  created_at: string;
  deleted_at?: string | null;
}

/**
 * Shape returned by identity-service `GET /tenants/{id}/usage`.
 * Source of truth: services/identity/src/identity_service/schemas/tenants.py
 *   class TenantUsageOut(...) → users/teachers/students/active_sessions/
 *   courses/submissions_30d/llm_tokens_30d.
 */
export interface TenantUsage {
  tenant_id: string;
  users: number;
  teachers: number;
  students: number;
  active_sessions: number;
  courses: number;
  submissions_30d: number;
  llm_tokens_30d: number;
}

export interface CreateTenantInput {
  // No slug — the backend auto-derives it from ``name``.
  name: string;
  domain?: string | null;
  settings?: Partial<TenantSettings>;
}

export interface UpdateTenantInput {
  name?: string;
  domain?: string | null;
}

export const tenantsApi = {
  list: (params: ListParams = {}) =>
    api
      .get<Paginated<Tenant>>('/tenants', { params: buildListParams(params) })
      .then((r) => r.data),

  get: (id: string) => api.get<Tenant>(`/tenants/${id}`).then((r) => r.data),

  create: (input: CreateTenantInput) =>
    api.post<Tenant>('/tenants', input).then((r) => r.data),

  update: (id: string, input: UpdateTenantInput) =>
    api.patch<Tenant>(`/tenants/${id}`, input).then((r) => r.data),

  delete: (id: string) =>
    api.delete<void>(`/tenants/${id}`).then((r) => r.data),

  suspend: (id: string) =>
    api.post<Tenant>(`/tenants/${id}:suspend`).then((r) => r.data),

  activate: (id: string) =>
    api.post<Tenant>(`/tenants/${id}:activate`).then((r) => r.data),

  getSettings: (id: string) =>
    api.get<TenantSettings>(`/tenants/${id}/settings`).then((r) => r.data),

  updateSettings: (id: string, settings: Partial<TenantSettings>) =>
    api.patch<TenantSettings>(`/tenants/${id}/settings`, settings).then((r) => r.data),

  usage: (id: string) =>
    api.get<TenantUsage>(`/tenants/${id}/usage`).then((r) => r.data),
};
