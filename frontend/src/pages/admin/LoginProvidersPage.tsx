/**
 * /admin/login-providers — «Вход через соцсети».
 *
 * Admin sets the social-login OAuth client credentials per provider
 * (Google / Yandex / GitHub / Telegram) so users register / sign in with a
 * single click. The LOGIN side of OAuth — distinct from /admin/integrations
 * (the IMPORT/EXPORT side).
 *
 * Layout — master-detail. A 260px sidebar lists providers with brand logos
 * (BrandIcon) + quiet status text; the detail pane shows the inline edit
 * form (no modal). A single thin vertical divider separates the two on md+.
 * Mobile (<md): sidebar stacks above the detail; no vertical divider.
 *
 * No bordered cards. Structure = master-detail layout + one divider.
 * Status is muted grey text (NO green / red colour signals).
 * Logos inherit ``currentColor`` (no full brand colours — they clash with
 * the dark theme).
 */
import { FormEvent, useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page, PageHeader } from '@/components/layout/Page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  useOAuthProviders,
  useUpdateOAuthProvider,
} from '@/hooks/api/useAdminOAuth';
import type { OAuthProviderInfo } from '@/api/endpoints/adminOAuth';
import type { Problem } from '@/api/types';
import { cn } from '@/components/ui/utils';

// Login-relevant providers only. Stepik is an import provider (data pulls),
// not a sign-in button — exclude it even if the API returns it. Order is
// stable so the sidebar doesn't shuffle between renders.
const LOGIN_PROVIDERS = new Set(['google', 'yandex', 'github', 'telegram']);
const PROVIDER_ORDER = ['google', 'yandex', 'github', 'telegram'];

// Per-provider "what to enable in the provider console" hint, shown in the
// detail pane so an admin knows which permissions/scopes the app must grant.
// The console permissions must be a SUPERSET of what identity requests
// (see services/identity/.../oauth/providers.py default_scopes).
const SETUP_HINT: Record<string, string> = {
  // Only Yandex needs a console hint (admin ticks matching permissions).
  // Google auto-grants; GitHub shows a Homepage-URL field; Telegram needs none.
  yandex: 'login_providers.setup_yandex',
};

// Scope chips help only where the admin must tick matching console
// permissions. Today that's just Yandex; Google/GitHub auto-grant.
const SHOW_SCOPES = new Set(['yandex']);

/** Configured = a client_id (preview) is present. The secret is write-only,
 *  so it can't be the readiness signal. */
function isConfigured(p: OAuthProviderInfo): boolean {
  return Boolean(p.client_id_preview);
}

export default function LoginProvidersPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('login_providers.title'));

  const { data, isPending, error } = useOAuthProviders();
  const providers = (data ?? [])
    .filter((p) => LOGIN_PROVIDERS.has(p.provider))
    .sort(
      (a, b) =>
        PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider),
    );

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first provider once the list arrives. Wrapped in an effect
  // so the initial render has ``selectedId === null`` and we don't fight
  // the API-loading state.
  useEffect(() => {
    if (selectedId === null && providers.length > 0) {
      setSelectedId(providers[0].provider);
    }
  }, [selectedId, providers]);

  const selected = providers.find((p) => p.provider === selectedId) ?? null;

  return (
    <Page width="regular">
      <PageHeader title={t('login_providers.title')} />

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t('login_providers.load_error')}</AlertTitle>
          <AlertDescription>
            {(error as unknown as Problem).detail ??
              (error as unknown as Problem).title ??
              String(error)}
          </AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('login_providers.loading')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Sidebar — vertical list of providers. No borders, no shadows;
              selection state is a quiet background tint. */}
          <nav
            aria-label={t('login_providers.nav_label')}
            className="flex flex-col py-2"
          >
            {providers.map((p) => {
              const configured = isConfigured(p);
              const isSelected = p.provider === selectedId;
              return (
                <button
                  key={p.provider}
                  type="button"
                  onClick={() => setSelectedId(p.provider)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'bg-muted/40'
                      : 'hover:bg-muted/20',
                  )}
                  data-testid={`login-provider-${p.provider}`}
                  aria-current={isSelected ? 'page' : undefined}
                >
                  <BrandIcon
                    provider={p.provider}
                    className="h-5 w-5 shrink-0 text-foreground/80"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {p.title}
                    </div>
                    <div
                      className={cn(
                        'text-xs truncate',
                        configured
                          ? 'text-muted-foreground'
                          : 'text-sev-mid font-medium',
                      )}
                    >
                      {configured
                        ? t('login_providers.configured')
                        : t('login_providers.not_configured')}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Detail pane — inline edit, one thin divider on md+. Pinned
              min-height so switching between configured and unconfigured
              providers doesn't shrink/grow the form and shift the layout
              (configured rows carry inline hints like "(оставьте пустым…)"
              that bare rows don't). */}
          <div className="md:border-l md:border-border/60 p-6 md:p-8 md:min-h-[480px]">
            {selected ? (
              <ProviderDetail provider={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('login_providers.empty')}
              </p>
            )}
          </div>
        </div>
      )}
    </Page>
  );
}

interface DetailProps {
  provider: OAuthProviderInfo;
}

function ProviderDetail({ provider }: DetailProps) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const update = useUpdateOAuthProvider();
  // Both fields start empty: client_id_preview is masked (not the real id),
  // and the secret is write-only. Per the PATCH contract, leaving a field
  // blank sends ``undefined`` → "leave unchanged".
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const configured = isConfigured(provider);
  const setupKey = SETUP_HINT[provider.provider];
  const showChips =
    SHOW_SCOPES.has(provider.provider) && !!(provider.scopes && provider.scopes.length);
  // Site origin (from our callback URL) for the GitHub / Telegram setup hints.
  let siteOrigin = '';
  try {
    siteOrigin = provider.redirect_uri ? new URL(provider.redirect_uri).origin : '';
  } catch {
    siteOrigin = '';
  }

  // Switching providers wipes the partially-typed form — otherwise we'd
  // leak secret-like input from one row to another.
  useEffect(() => {
    setClientId('');
    setClientSecret('');
    setProblem(null);
  }, [provider.provider]);

  const copyText = (value: string) => {
    if (value && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(value);
      notify.info(t('login_providers.redirect_copied'));
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!configured && (!clientId.trim() || !clientSecret.trim())) {
      setProblem({
        title: t('login_providers.err_both_required_title'),
        detail: t('login_providers.err_both_required_detail'),
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    if (configured && !clientId.trim() && !clientSecret.trim()) {
      setProblem({
        title: t('login_providers.err_nothing_to_save_title'),
        detail: t('login_providers.err_nothing_to_save_detail'),
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    try {
      await update.mutateAsync({
        provider: provider.provider,
        payload: {
          client_id: clientId.trim() ? clientId.trim() : undefined,
          client_secret: clientSecret.trim() ? clientSecret.trim() : undefined,
        },
      });
      notify.success(t('login_providers.saved', { name: provider.title }));
      setClientId('');
      setClientSecret('');
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <BrandIcon
          provider={provider.provider}
          className="h-7 w-7 shrink-0 text-foreground/80"
        />
        <h2 className="text-xl font-semibold text-foreground">
          {provider.title}
        </h2>
        {provider.docs_url && (
          <a
            href={provider.docs_url}
            target="_blank"
            rel="noopener noreferrer"
            title={t('login_providers.docs_link')}
            aria-label={t('login_providers.docs_link')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            data-testid="login-docs-link"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <span
          className={cn(
            'ml-auto text-xs',
            configured
              ? 'text-muted-foreground'
              : 'text-sev-mid font-medium',
          )}
        >
          {configured
            ? t('login_providers.configured')
            : t('login_providers.not_configured')}
        </span>
      </header>

      {(setupKey || showChips) && (
        <div className="space-y-2">
          {setupKey && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(setupKey, { url: siteOrigin })}
            </p>
          )}
          {showChips && (
            <div className="flex flex-wrap gap-1.5" data-testid="login-scopes">
              {(provider.scopes ?? []).map((s) => (
                <span
                  key={s}
                  className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-foreground/80"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {problem && (
          <Alert variant="destructive">
            <AlertTitle>{problem.title}</AlertTitle>
            {problem.detail && (
              <AlertDescription>{problem.detail}</AlertDescription>
            )}
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="login-client-id">
            Client ID
            {configured && (
              <span className="ml-2 text-xs text-muted-foreground">
                {t('login_providers.hint_leave_blank')}
              </span>
            )}
          </Label>
          <Input
            id="login-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="font-mono text-xs"
            autoComplete="off"
            placeholder={provider.client_id_preview || ''}
            data-testid="login-client-id"
            disabled={!provider.editable}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="login-client-secret">
            Client Secret
            {provider.has_secret && (
              <span className="ml-2 text-xs text-muted-foreground">
                {t('login_providers.hint_reenter')}
              </span>
            )}
          </Label>
          <Input
            id="login-client-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            className="font-mono text-xs"
            autoComplete="new-password"
            placeholder={provider.has_secret ? '••••••••' : ''}
            data-testid="login-client-secret"
            disabled={!provider.editable}
          />
        </div>

        {provider.provider === 'github' && siteOrigin && (
          <div className="space-y-1.5">
            <Label>Homepage URL</Label>
            <div
              className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
              data-testid="login-homepage-github"
            >
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                {siteOrigin}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-1 h-7 w-7 shrink-0"
                onClick={() => copyText(siteOrigin)}
                title={t('login_providers.copy')}
                aria-label={t('login_providers.copy')}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {provider.redirect_uri && (
          <div className="space-y-1.5">
            <Label>Redirect URI</Label>
            <div
              className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
              data-testid={`login-redirect-${provider.provider}`}
            >
              <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
                {provider.redirect_uri}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-1 h-7 w-7 shrink-0"
                onClick={() => copyText(provider.redirect_uri ?? '')}
                title={t('login_providers.copy')}
                aria-label={t('login_providers.copy_redirect_aria')}
                data-testid={`login-copy-${provider.provider}`}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={update.isPending || !provider.editable}
            data-testid="login-save"
            title={
              provider.editable
                ? undefined
                : t('login_providers.env_managed')
            }
          >
            {update.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t('login_providers.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
