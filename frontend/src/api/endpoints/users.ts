/**
 * User self-service + admin user CRUD — Identity Service §G, §H, §I, §L.
 */
import api from '../client';
import type { CurrentUser, GlobalRole, Paginated, UserSummary } from '../types';
import { buildListParams, type ListParams } from '../pagination';

// -------------------- Types --------------------

export interface UserListFilters extends ListParams {
  role?: GlobalRole;
  course_id?: string;
  status?: 'active' | 'disabled';
  tenant_id?: string;
}

export interface CreateUserInput {
  email: string;
  display_name: string;
  global_role: GlobalRole;
  locale?: string;
  send_invitation?: boolean;
  tenant_slug?: string;
  /** Admin-only: create the user in this tenant (backend reads ``tenant_id``
   *  from the create payload for admins). Used by the per-tenant users tab. */
  tenant_id?: string;
}

export interface BulkInviteInput {
  emails: string[];
  global_role: GlobalRole;
  message?: string;
}

export interface UpdateUserInput {
  display_name?: string;
  locale?: string;
  timezone?: string;
  global_role?: GlobalRole;
}

export interface UserDetail extends UserSummary {
  tenant_id: string;
  status: 'active' | 'disabled';
  locale: string;
  timezone: string | null;
  created_at: string;
  last_login_at: string | null;
  email_verified_at: string | null;
  anonymized_at: string | null;
}

export interface UserSession {
  id: string;
  ip: string;
  user_agent: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  current?: boolean;
}

export interface ExternalBinding {
  id: string;
  user_id: string;
  system: 'stepik' | 'yandex_contest';
  external_id: string;
  display_name: string;
  linked_at: string;
}

export interface OAuthIdentity {
  id: string;
  provider: 'google' | 'yandex' | 'stepik' | 'github';
  provider_user_id: string;
  email: string;
  linked_at: string;
}

export interface ApiKey {
  id: string;
  name: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  /** Full key (shown only once on creation/rotation). */
  key: string;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

// -------------------- API --------------------

export const usersApi = {
  // -------- Self-service --------
  me: () => api.get<CurrentUser>('/users/me').then((r) => r.data),

  patchMe: (patch: Partial<Pick<CurrentUser, 'display_name' | 'locale' | 'timezone' | 'email'>>) =>
    api.patch<CurrentUser>('/users/me', patch).then((r) => r.data),

  uploadAvatar: (formData: FormData) =>
    api.post<CurrentUser>('/users/me/avatar', formData).then((r) => r.data),

  deleteAvatar: () =>
    api.delete<CurrentUser>('/users/me/avatar').then((r) => r.data),

  listSessions: () =>
    api
      .get<{ data: Array<UserSession & { is_current?: boolean }> }>(
        '/users/me/sessions',
      )
      // Backend serialises the flag as ``is_current``; the UI reads ``current``.
      .then((r) =>
        r.data.data.map((s) => ({ ...s, current: s.is_current ?? s.current })),
      ),

  revokeSession: (id: string) =>
    api.delete<void>(`/users/me/sessions/${id}`).then((r) => r.data),

  revokeAllSessions: () =>
    api.post<void>('/users/me/sessions:revokeAll').then((r) => r.data),

  changePassword: (input: { current_password: string; new_password: string }) =>
    api.post<void>('/auth/password/change', input).then((r) => r.data),

  enable2fa: (totp_code: string) =>
    api.post<{ enabled: true }>('/auth/2fa/enable', { totp_code }).then((r) => r.data),

  disable2fa: (password: string) =>
    api.post<{ enabled: false }>('/auth/2fa/disable', { password }).then((r) => r.data),

  enroll2fa: () =>
    api
      .post<{ secret: string; otpauth_uri: string; qr_data_url?: string }>('/auth/2fa/enroll')
      .then((r) => r.data),

  // -------- My API keys --------
  listMyApiKeys: () =>
    api.get<{ data: ApiKey[] }>('/users/me/api-keys').then((r) => r.data.data),

  createMyApiKey: (input: CreateApiKeyInput) =>
    api.post<ApiKeyCreated>('/users/me/api-keys', input).then((r) => r.data),

  rotateMyApiKey: (id: string) =>
    api.post<ApiKeyCreated>(`/users/me/api-keys/${id}:rotate`).then((r) => r.data),

  deleteMyApiKey: (id: string) =>
    api.delete<void>(`/users/me/api-keys/${id}`).then((r) => r.data),

  // -------- My external bindings --------
  listMyExternalBindings: () =>
    api
      .get<{ data: ExternalBinding[] }>('/users/me/external-bindings')
      .then((r) => r.data.data),

  addMyExternalBinding: (input: {
    system: 'stepik' | 'yandex_contest';
    external_id: string;
    display_name?: string;
  }) =>
    api
      .post<ExternalBinding>('/users/me/external-bindings', input)
      .then((r) => r.data),

  removeMyExternalBinding: (binding_id: string) =>
    api.delete<void>(`/users/me/external-bindings/${binding_id}`).then((r) => r.data),

  // -------- Admin --------
  list: (params: UserListFilters = {}) => {
    const base = buildListParams(params);
    if (params.role) base.role = params.role;
    if (params.course_id) base.course_id = params.course_id;
    if (params.status) base.status = params.status;
    if (params.tenant_id) base.tenant_id = params.tenant_id;
    return api
      .get<Paginated<UserDetail>>('/users', { params: base })
      .then((r) => r.data);
  },

  get: (id: string) =>
    api.get<UserDetail>(`/users/${id}`).then((r) => r.data),

  create: (input: CreateUserInput) =>
    api.post<UserDetail>('/users', input).then((r) => r.data),

  bulkInvite: (input: BulkInviteInput) =>
    api
      .post<{ invited: number; skipped: number }>('/users:batchCreate', input)
      .then((r) => r.data),

  update: (id: string, input: UpdateUserInput) =>
    api.patch<UserDetail>(`/users/${id}`, input).then((r) => r.data),

  disable: (id: string) =>
    api.post<UserDetail>(`/users/${id}:disable`).then((r) => r.data),

  enable: (id: string) =>
    api.post<UserDetail>(`/users/${id}:enable`).then((r) => r.data),

  anonymize: (id: string) =>
    api.post<void>(`/users/${id}:anonymize`).then((r) => r.data),

  resetPassword: (id: string) =>
    api
      .post<{ reset_link_sent: boolean }>(`/users/${id}:reset-password`)
      .then((r) => r.data),

  forceLogout: (id: string) =>
    api.post<void>(`/users/${id}:force-logout`).then((r) => r.data),

  listSessionsForUser: (id: string) =>
    api
      .get<{ data: UserSession[] }>(`/users/${id}/sessions`)
      .then((r) => r.data.data),

  listExternalBindings: (id: string) =>
    api
      .get<{ data: ExternalBinding[] }>(`/users/${id}/external-bindings`)
      .then((r) => r.data.data),

  addExternalBinding: (
    id: string,
    input: { system: 'stepik' | 'yandex_contest'; external_id: string; display_name?: string },
  ) =>
    api.post<ExternalBinding>(`/users/${id}/external-bindings`, input).then((r) => r.data),

  removeExternalBinding: (id: string, binding_id: string) =>
    api
      .delete<void>(`/users/${id}/external-bindings/${binding_id}`)
      .then((r) => r.data),

  listOAuthIdentities: (id: string) =>
    api
      .get<{ data: OAuthIdentity[] }>(`/users/${id}/oauth-identities`)
      .then((r) => r.data.data),

  unlinkOAuth: (provider: 'google' | 'yandex' | 'stepik' | 'github' | 'telegram') =>
    api.delete<void>(`/auth/oauth/${provider}/unlink`).then((r) => r.data),

  // -------- Admin: API keys for a specific user --------
  // TODO(backend): endpoint GET /admin/users/:id/api-keys does not yet exist in
  // identity service (see services/identity/src/identity_service/api/v1/api_keys.py
  // — only /users/me/api-keys is wired). When implemented, this call will
  // start working without UI changes.
  listApiKeysForUser: (id: string) =>
    api
      .get<{ data: ApiKey[] }>(`/admin/users/${id}/api-keys`)
      .then((r) => r.data.data),

  // TODO(backend): endpoint DELETE /admin/users/:id/api-keys/:key_id does not
  // yet exist; admins currently cannot revoke arbitrary user keys.
  revokeApiKeyForUser: (user_id: string, key_id: string) =>
    api
      .delete<void>(`/admin/users/${user_id}/api-keys/${key_id}`)
      .then((r) => r.data),
};
