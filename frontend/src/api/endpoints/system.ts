/**
 * System / gateway health & info endpoints — see 13-GATEWAY.md.
 */
import api from '../client';

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency_ms: number | null;
  last_checked_at: string;
  version?: string | null;
  message?: string | null;
}

export interface ServicesStatus {
  services: ServiceStatus[];
  recent_errors?: Array<{
    service: string;
    occurred_at: string;
    message: string;
  }>;
}

export interface SystemVersion {
  app_name: string;
  version: string;
  build: string;
  deployed_at: string;
  uptime_seconds: number;
  environment?: string;
}

export interface RoleMeta {
  role: string;
  description?: string | null;
}

export interface PermissionMeta {
  permission: string;
  description?: string | null;
}

export interface RolePermissions {
  role: string;
  permissions: string[];
}

export const systemApi = {
  // Gateway-owned endpoints; BASE_URL already prepends `/api/v1`.
  servicesStatus: () =>
    api.get<ServicesStatus>('/services-status').then((r) => r.data),

  version: () =>
    api.get<SystemVersion>('/version').then((r) => r.data),

  // GET /roles returns a bare array of { role, description }.
  listRoles: () =>
    api.get<RoleMeta[]>('/roles').then((r) => r.data),

  // GET /permissions — the full permission catalogue (matrix rows).
  permissionsCatalogue: () =>
    api.get<PermissionMeta[]>('/permissions').then((r) => r.data),

  rolePermissions: (role: string) =>
    api
      .get<RolePermissions>(`/roles/${role}/permissions`)
      .then((r) => r.data),

  updateRolePermissions: (role: string, permissions: string[]) =>
    api
      .patch<RolePermissions>(`/roles/${role}/permissions`, { permissions })
      .then((r) => r.data),
};
