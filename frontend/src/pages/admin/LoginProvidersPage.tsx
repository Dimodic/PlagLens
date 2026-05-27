/**
 * /admin/login-providers — «Вход через соцсети».
 *
 * Admin sets the social-login OAuth client credentials per provider
 * (Google / Yandex / GitHub / Telegram) so users register / sign in with a
 * single click. This is the LOGIN side of OAuth — distinct from
 * /admin/integrations (the IMPORT/EXPORT side).
 *
 * Flat document rows (no cards) — same rhythm as the integration OAuth
 * directory, per the design code. State is shown as quiet muted text (the
 * «Настроить / Изменить» button already signals it) — no coloured badges.
 * ``redirect_uri`` is copy-only: it's our fixed callback, you paste it INTO
 * the provider's app, you don't edit it. The secret is write-only.
 */
import { FormEvent, useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page, PageHeader } from '@/components/layout/Page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useOAuthProviders,
  useUpdateOAuthProvider,
} from '@/hooks/api/useAdminOAuth';
import type { OAuthProviderInfo } from '@/api/endpoints/adminOAuth';
import type { Problem } from '@/api/types';

// Login-relevant providers only. Stepik is an import provider (data pulls),
// not a sign-in button — exclude it even if the API returns it.
const LOGIN_PROVIDERS = new Set(['google', 'yandex', 'github', 'telegram']);

/** Configured = a client_id (preview) is present. The secret is write-only,
 *  so it can't be the readiness signal. */
function isConfigured(p: OAuthProviderInfo): boolean {
  return Boolean(p.client_id_preview);
}

export default function LoginProvidersPage() {
  useDocumentTitle('Вход через соцсети');
  const notify = useNotifications();

  const { data, isPending, error } = useOAuthProviders();
  const providers = (data ?? []).filter((p) => LOGIN_PROVIDERS.has(p.provider));

  const [editing, setEditing] = useState<OAuthProviderInfo | null>(null);

  const copy = (text: string) => {
    if (text && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
      notify.info('Redirect URI скопирован');
    }
  };

  return (
    <Page width="regular">
      <PageHeader title="Вход через соцсети" />

      <p className="text-sm text-muted-foreground">
        Заполните <code className="font-mono">client_id</code> и{' '}
        <code className="font-mono">client_secret</code> приложения — и
        пользователи смогут регистрироваться и входить одним кликом. Скопируйте{' '}
        <code className="font-mono">redirect_uri</code> в настройки приложения на
        стороне провайдера, иначе он отклонит вход.
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
        <div className="divide-y divide-border/50 border-y border-border/50">
          {providers.map((p) => {
            const configured = isConfigured(p);
            return (
              <div
                key={p.provider}
                className="grid grid-cols-[1fr_auto] items-center gap-4 py-4"
                data-testid={`login-provider-${p.provider}`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {p.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {configured ? 'настроено' : 'не настроено'}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-muted-foreground">client_id</span>
                    <span className="font-mono text-foreground/80 truncate">
                      {p.client_id_preview || '—'}
                    </span>
                    {p.redirect_uri && (
                      <>
                        <span className="text-muted-foreground">redirect_uri</span>
                        <span className="font-mono text-foreground/80 truncate">
                          {p.redirect_uri}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {p.redirect_uri && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copy(p.redirect_uri)}
                      title="Скопировать redirect URI"
                      aria-label="Скопировать redirect URI"
                      data-testid={`login-copy-${p.provider}`}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  )}
                  {p.docs_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      title="Где зарегистрировать"
                      aria-label="Где зарегистрировать"
                    >
                      <a href={p.docs_url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(p)}
                    disabled={!p.editable}
                    title={
                      p.editable
                        ? undefined
                        : 'Настраивается через переменные окружения'
                    }
                    data-testid={`login-edit-${p.provider}`}
                  >
                    {configured ? 'Изменить' : 'Настроить'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ProviderEditDialog
          provider={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Page>
  );
}

interface DialogProps {
  provider: OAuthProviderInfo;
  onClose: () => void;
}

function ProviderEditDialog({ provider, onClose }: DialogProps) {
  const notify = useNotifications();
  const update = useUpdateOAuthProvider();
  // Both fields start empty: client_id_preview is masked (not the real id),
  // and the secret is write-only. Per the PATCH contract, leaving a field
  // blank sends ``undefined`` → "leave unchanged".
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const configured = isConfigured(provider);

  useEffect(() => {
    setClientId('');
    setClientSecret('');
    setProblem(null);
  }, [provider]);

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
    if (!clientId.trim() && !clientSecret.trim()) {
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
      onClose();
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{provider.title}</DialogTitle>
          <DialogDescription>Вход через {provider.provider}</DialogDescription>
        </DialogHeader>

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
            />
          </div>

          {provider.redirect_uri && (
            <div className="space-y-1.5">
              <Label htmlFor="login-redirect-uri-dialog">Redirect URI</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="login-redirect-uri-dialog"
                  readOnly
                  value={provider.redirect_uri}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    void navigator.clipboard?.writeText(provider.redirect_uri);
                    notify.info('Redirect URI скопирован');
                  }}
                  title="Скопировать"
                  aria-label="Скопировать redirect URI"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Это наш фиксированный адрес — только скопируйте его в настройки
                приложения у провайдера. Менять не нужно.
              </p>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              disabled={update.isPending}
              data-testid="login-save"
            >
              {update.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
