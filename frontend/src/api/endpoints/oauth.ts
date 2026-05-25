/**
 * OAuth endpoints — Identity Service §E.
 */
import api from '../client';
import type { OAuthProvider } from '../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

/** Public bits the SPA needs to render the Telegram Login Widget. */
export interface TelegramBotInfo {
  enabled: boolean;
  /** Bot's @-username (without @). Null when Telegram is not configured. */
  bot_username: string | null;
  /** Absolute URL of the backend callback — fed into widget's data-auth-url. */
  redirect_uri: string;
}

export const telegramAuthApi = {
  info: () =>
    api
      .get<TelegramBotInfo>('/auth/oauth/telegram/info')
      .then((r) => r.data),
};

/**
 * Build the URL that kicks off provider OAuth.
 * The browser MUST be redirected to this URL (full page redirect, not XHR).
 */
export function buildOAuthAuthorizeUrl(
  provider: OAuthProvider,
  opts: { return_url?: string; tenant_slug?: string } = {},
): string {
  const url = new URL(`${BASE_URL}/auth/oauth/${provider}/authorize`, window.location.origin);
  if (opts.return_url) url.searchParams.set('return_url', opts.return_url);
  if (opts.tenant_slug) url.searchParams.set('tenant_slug', opts.tenant_slug);
  return url.toString();
}

export function startOAuth(provider: OAuthProvider, return_url?: string, tenant_slug?: string): void {
  window.location.href = buildOAuthAuthorizeUrl(provider, { return_url, tenant_slug });
}

// Order matters: this is the order in which the icon row renders on /login.
// Stepik is intentionally NOT here — admins can still wire Stepik OAuth via
// the admin "Интеграции → Авторизация" tab (used for grade-sync / import
// flows), but the login page only surfaces the providers a regular user
// would expect to sign in with.
export const OAUTH_PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'yandex', label: 'Яндекс' },
  { id: 'github', label: 'GitHub' },
];
