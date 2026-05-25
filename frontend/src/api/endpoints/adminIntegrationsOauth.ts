/**
 * Admin-managed OAuth app credentials for **integration imports**.
 *
 * Distinct from ``adminOAuth`` (which manages identity-side OAuth used
 * for signing in to the platform): these creds are read by the
 * integration service when it wants to talk to Y.Contest / Stepik /
 * Google Sheets on behalf of a teacher (POST /api/v1/integrations →
 * oauth_authorize_url uses *this* table to know whom to redirect to).
 *
 * Backed by GET/PUT/DELETE /api/v1/admin/integrations/oauth-providers.
 */
import api from '../client';

export type IntegrationOAuthKind = 'yandex_contest' | 'stepik' | 'google_sheets';

export interface IntegrationOAuthProviderInfo {
  provider_kind: IntegrationOAuthKind;
  title: string;
  /** Where the admin registers a new OAuth app on the provider's side. */
  register_url?: string | null;
  default_scope?: string | null;
  default_redirect_uri?: string | null;
  /** True if a credential row exists for the current tenant. */
  configured: boolean;
  /** Plain client_id (never secret). */
  client_id?: string | null;
  /** Set-flag only — backend never echoes the secret back. */
  client_secret_set: boolean;
  redirect_uri?: string | null;
  scope?: string | null;
  updated_at?: string | null;
}

export interface IntegrationOAuthUpsertInput {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scope?: string | null;
}

export const adminIntegrationsOauthApi = {
  list: () =>
    api
      .get<{ data: IntegrationOAuthProviderInfo[] }>(
        '/admin/integrations/oauth-providers',
      )
      .then((r) => r.data.data),

  get: (kind: IntegrationOAuthKind) =>
    api
      .get<IntegrationOAuthProviderInfo>(
        `/admin/integrations/oauth-providers/${kind}`,
      )
      .then((r) => r.data),

  upsert: (kind: IntegrationOAuthKind, payload: IntegrationOAuthUpsertInput) =>
    api
      .put<IntegrationOAuthProviderInfo>(
        `/admin/integrations/oauth-providers/${kind}`,
        payload,
      )
      .then((r) => r.data),

  remove: (kind: IntegrationOAuthKind) =>
    api
      .delete<void>(`/admin/integrations/oauth-providers/${kind}`)
      .then((r) => r.data),
};
