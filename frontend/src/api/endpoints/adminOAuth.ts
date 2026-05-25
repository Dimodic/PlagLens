/**
 * Admin-only OAuth provider directory.
 *
 * The endpoint is read-only for now — credentials are sourced from env vars
 * on the identity host; UI surfaces the status + redirect URI so the admin
 * can register the application on the provider's side without SSHing in.
 * Editable mode (DB-backed override) is on the roadmap.
 */
import api from '../client';

export interface OAuthProviderInfo {
  provider: 'google' | 'yandex' | 'stepik' | 'github' | string;
  title: string;
  enabled: boolean;
  client_id_preview: string;
  has_secret: boolean;
  redirect_uri: string;
  docs_url?: string | null;
  /** 'env' — falls back to env vars, 'override' — uses DB-stored override. */
  source: 'env' | 'override';
  editable: boolean;
}

export interface OAuthProviderUpdate {
  /** ``null``/undefined = leave unchanged, ``""`` = clear override, value = set. */
  client_id?: string | null;
  client_secret?: string | null;
}

export const adminOAuthApi = {
  listProviders: () =>
    api
      .get<OAuthProviderInfo[]>('/admin/oauth/providers')
      .then((r) => r.data),

  update: (provider: string, payload: OAuthProviderUpdate) =>
    api
      .patch<OAuthProviderInfo>(`/admin/oauth/providers/${provider}`, payload)
      .then((r) => r.data),
};
