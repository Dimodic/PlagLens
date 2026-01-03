/**
 * OAuth endpoints — Identity Service §E.
 */
import type { OAuthProvider } from '../types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';

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

export const OAUTH_PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'yandex', label: 'Яндекс' },
  { id: 'stepik', label: 'Stepik' },
  { id: 'github', label: 'GitHub' },
];
