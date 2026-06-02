/**
 */
import api from '../client';
import type { Paginated } from '../types';
import { buildListParams, type ListParams } from '../pagination';

export type AuditResult = 'success' | 'failure';
export type AuditActorType = 'user' | 'system' | 'integration';
export type RetentionClass = 'default' | 'long' | 'legal_hold';

export interface AuditActor {
  type: AuditActorType;
  id: string | null;
  role?: string | null;
  display_name?: string | null;
}

export interface AuditResource {
  type: string;
  id: string | null;
  parent_id?: string | null;
  parent_type?: string | null;
}

export interface AuditEvent {
  id: string;
  tenant_id: string | null;
  occurred_at: string;
  recorded_at: string;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  result: AuditResult;
  source_service: string;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  retention_class: RetentionClass;
}

export interface AuditFilters extends ListParams {
  actor_id?: string;
  actor_type?: AuditActorType;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  result?: AuditResult;
  since?: string;
  until?: string;
  source_service?: string;
}

export interface AuditAggregation {
  type: 'count';
  by: string;
  values: Array<{ key: string; count: number }>;
}

export interface AuditSearchBody {
  q?: string;
  filters?: Partial<Omit<AuditFilters, keyof ListParams>>;
  aggregations?: Array<{ type: 'count'; by: string }>;
  cursor?: string | null;
  limit?: number;
}

export interface AuditSearchResponse extends Paginated<AuditEvent> {
  aggregations?: AuditAggregation[];
}

export interface RetentionPolicy {
  scope: 'system' | 'tenant';
  scope_id: string;
  default_retention_days: number;
  long_retention_days: number;
  legal_hold_active: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface LegalHold {
  id: string;
  scope: string;
  resource_id: string;
  reason: string;
  started_at: string;
  ended_at: string | null;
  requested_by: string;
}

export interface RetentionStatus {
  events_due_for_cleanup: number;
  next_cleanup_at: string | null;
  last_cleanup_at: string | null;
  legal_holds_count: number;
}

export const auditApi = {
  // ``crossTenant`` lets an admin read another tenant's events — the backend
  // resolves scope from the ``X-Cross-Tenant`` header (admin-only; everyone
  // else stays pinned to their own tenant).
  list: (params: AuditFilters = {}, opts: { crossTenant?: string } = {}) => {
    const base = buildListParams(params);
    if (params.actor_id) base.actor_id = params.actor_id;
    if (params.actor_type) base.actor_type = params.actor_type;
    if (params.action) base.action = params.action;
    if (params.resource_type) base.resource_type = params.resource_type;
    if (params.resource_id) base.resource_id = params.resource_id;
    if (params.result) base.result = params.result;
    if (params.since) base.since = params.since;
    if (params.until) base.until = params.until;
    if (params.source_service) base.source_service = params.source_service;
    return api
      .get<Paginated<AuditEvent>>('/audit/events', {
        params: base,
        headers: opts.crossTenant
          ? { 'X-Cross-Tenant': opts.crossTenant }
          : undefined,
      })
      .then((r) => r.data);
  },

  get: (id: string) =>
    api.get<AuditEvent>(`/audit/events/${id}`).then((r) => r.data),

  search: (body: AuditSearchBody) =>
    api
      .post<AuditSearchResponse>('/audit/events:search', body)
      .then((r) => r.data),

  byActor: (user_id: string, params: ListParams = {}) =>
    api
      .get<Paginated<AuditEvent>>(`/audit/events/by-actor/${user_id}`, {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  byResource: (resource_type: string, resource_id: string, params: ListParams = {}) =>
    api
      .get<Paginated<AuditEvent>>(
        `/audit/events/by-resource/${resource_type}/${resource_id}`,
        { params: buildListParams(params) },
      )
      .then((r) => r.data),

  accessDenied: (params: ListParams = {}) =>
    api
      .get<Paginated<AuditEvent>>('/audit/access-denied', {
        params: buildListParams(params),
      })
      .then((r) => r.data),

  // -------- Retention policy --------
  getRetentionPolicy: () =>
    api
      .get<RetentionPolicy>('/admin/audit/retention-policy')
      .then((r) => r.data),

  updateRetentionPolicy: (body: Partial<Omit<RetentionPolicy, 'scope' | 'scope_id' | 'updated_at' | 'updated_by'>>) =>
    api
      .patch<RetentionPolicy>('/admin/audit/retention-policy', body)
      .then((r) => r.data),

  retentionStatus: () =>
    api
      .get<RetentionStatus>('/admin/audit/retention-status')
      .then((r) => r.data),

  // -------- Async CSV/JSON export (proxied to Reporting service) --------
  // POST /audit/events:export → 202 with operation_id + status_url.
  exportEvents: (body: { format: 'csv' | 'json'; filters?: Partial<Omit<AuditFilters, keyof ListParams>> }) =>
    api
      .post<{ operation_id: string; status_url: string }>('/audit/events:export', body)
      .then((r) => r.data),

  // -------- Legal holds --------
  listLegalHolds: () =>
    api
      .get<{ data: LegalHold[] }>('/admin/audit/legal-holds')
      .then((r) => r.data.data),

  createLegalHold: (input: { resource_id: string; reason: string }) =>
    api
      .post<LegalHold>('/admin/audit/legal-holds', input)
      .then((r) => r.data),

  deleteLegalHold: (id: string) =>
    api
      .delete<void>(`/admin/audit/legal-holds/${id}`)
      .then((r) => r.data),
};
