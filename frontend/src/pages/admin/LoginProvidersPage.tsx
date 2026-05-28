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

/** Configured = a client_id (preview) is present. The secret is write-only,
 *  so it can't be the readiness signal. */
function isConfigured(p: OAuthProviderInfo): boolean {
  return Boolean(p.client_id_preview);
}

export default function LoginProvidersPage() {
  useDocumentTitle('Вход через соцсети');

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
    <Page width="wide">
      <PageHeader title="Вход через соцсети" />

      <p className="text-sm text-muted-foreground">
        Подключите вход через соцсети — пользователи смогут регистрироваться
        одним кликом.
      </p>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось загрузить</AlertTitle>
          <AlertDescription>
            {(error as unknown as Problem).detail ??
              (error as unknown as Problem).title ??
              String(error)}
          </AlertDescription>
        </Alert>
      )}

      {isPending ? (
        <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
          {/* Sidebar — vertical list of providers. No borders, no shadows;
              selection state is a quiet background tint. */}
          <nav
            aria-label="Провайдеры входа"
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
                    <div className="text-xs text-muted-foreground truncate">
                      {configured ? 'настроено' : 'не настроено'}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Detail pane — inline edit, one thin divider on md+. */}
          <div className="md:border-l md:border-border/60 p-6 md:p-8">
            {selected ? (
              <ProviderDetail provider={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Выберите провайдера слева.
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
  const notify = useNotifications();
  const update = useUpdateOAuthProvider();
  // Both fields start empty: client_id_preview is masked (not the real id),
  // and the secret is write-only. Per the PATCH contract, leaving a field
  // blank sends ``undefined`` → "leave unchanged".
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const configured = isConfigured(provider);

  // Switching providers wipes the partially-typed form — otherwise we'd
  // leak secret-like input from one row to another.
  useEffect(() => {
    setClientId('');
    setClientSecret('');
    setProblem(null);
  }, [provider.provider]);

  const copyRedirect = () => {
    if (provider.redirect_uri && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(provider.redirect_uri);
      notify.info('Redirect URI скопирован');
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!configured && (!clientId.trim() || !clientSecret.trim())) {
      setProblem({
        title: 'Заполните оба поля',
        detail: 'Client ID и Client Secret обязательны при первой настройке.',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    if (configured && !clientId.trim() && !clientSecret.trim()) {
      setProblem({
        title: 'Нечего сохранять',
        detail: 'Введите новый Client ID или Client Secret.',
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
      notify.success(`${provider.title}: ключи сохранены`);
      setClientId('');
      setClientSecret('');
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <BrandIcon
          provider={provider.provider}
          className="h-7 w-7 shrink-0 text-foreground/80"
        />
        <h2 className="text-xl font-semibold text-foreground">
          {provider.title}
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {configured ? 'настроено' : 'не настроено'}
        </span>
      </header>

      {provider.docs_url && (
        <a
          href={provider.docs_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          data-testid="login-docs-link"
        >
          где зарегистрировать
          <ExternalLink className="h-3 w-3" />
        </a>
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
                (оставьте пустым, чтобы не менять)
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
                (введите заново для замены)
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

        {provider.redirect_uri && (
          <div className="space-y-1.5">
            <Label htmlFor="login-redirect-uri">Redirect URI</Label>
            <div className="flex items-center gap-2">
              <Input
                id="login-redirect-uri"
                readOnly
                value={provider.redirect_uri}
                className="font-mono text-xs"
                data-testid={`login-redirect-${provider.provider}`}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyRedirect}
                title="Скопировать"
                aria-label="Скопировать redirect URI"
                data-testid={`login-copy-${provider.provider}`}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Это наш фиксированный адрес — только скопируйте.
            </p>
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
                : 'Настраивается через переменные окружения'
            }
          >
            {update.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Сохранить
          </Button>
        </div>
      </form>
    </div>
  );
}
