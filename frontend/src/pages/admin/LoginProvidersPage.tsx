/**
 * /admin/login-providers — «Вход через соцсети».
 *
 * Admin sets the social-login OAuth client credentials per provider
 * (Google / Yandex / GitHub / Telegram) so users register / sign in with a
 * single click. The LOGIN side of OAuth — distinct from /admin/integrations
 * (the IMPORT/EXPORT side).
 *
 * Layout — «карточки, но не карточки»: a 2×2 grid where four thin segments
 * draw a "+"-shaped divider between the quadrants WITH a gap at the centre
 * (the segments stop short of the intersection). No card borders, no card
 * backgrounds — structure comes from the cross alone. State is shown as
 * quiet muted text; the «Настроить / Изменить» button already signals it.
 * Per-cell content is intentionally medium-density: name + status,
 * redirect_uri (copy-only, our fixed callback — paste into the provider's
 * app), and the edit action. Everything else (client_id preview, docs link)
 * lives inside the edit dialog.
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
import { cn } from '@/components/ui/utils';

// Login-relevant providers only. Stepik is an import provider (data pulls),
// not a sign-in button — exclude it even if the API returns it. Order is
// stable so the 2×2 layout doesn't shuffle between renders.
const LOGIN_PROVIDERS = new Set(['google', 'yandex', 'github', 'telegram']);
const PROVIDER_ORDER = ['google', 'yandex', 'github', 'telegram'];

/** Configured = a client_id (preview) is present. The secret is write-only,
 *  so it can't be the readiness signal. */
function isConfigured(p: OAuthProviderInfo): boolean {
  return Boolean(p.client_id_preview);
}

export default function LoginProvidersPage() {
  useDocumentTitle('Вход через соцсети');
  const notify = useNotifications();

  const { data, isPending, error } = useOAuthProviders();
  const providers = (data ?? [])
    .filter((p) => LOGIN_PROVIDERS.has(p.provider))
    .sort(
      (a, b) =>
        PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider),
    );

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
        пользователи смогут регистрироваться и входить одним кликом.
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
        <div className="relative grid grid-cols-1 md:grid-cols-2">
          {/* Cross-with-gap divider — four thin segments that stop ~28px short
              of the centre, leaving a clear "breath" at the intersection.
              Desktop only; on mobile the cells stack with a simple border-b
              between them. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-0 hidden h-[calc(50%-28px)] w-px -translate-x-1/2 bg-border md:block"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 bottom-0 hidden h-[calc(50%-28px)] w-px -translate-x-1/2 bg-border md:block"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-0 hidden h-px w-[calc(50%-28px)] -translate-y-1/2 bg-border md:block"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-0 hidden h-px w-[calc(50%-28px)] -translate-y-1/2 bg-border md:block"
          />

          {providers.map((p, i) => {
            const configured = isConfigured(p);
            const isLast = i === providers.length - 1;
            return (
              <div
                key={p.provider}
                className={cn(
                  'space-y-3 p-6',
                  // Mobile (1-col) divider between cells; on desktop the cross
                  // handles separation, so no border there.
                  !isLast && 'border-b border-border/60 md:border-0',
                )}
                data-testid={`login-provider-${p.provider}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    {p.title}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {configured ? 'настроено' : 'не настроено'}
                  </span>
                </div>

                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-xs">
                  <span className="text-muted-foreground">client_id</span>
                  <code className="font-mono text-foreground/80 truncate">
                    {p.client_id_preview || '—'}
                  </code>
                  <span />
                  {p.redirect_uri && (
                    <>
                      <span className="text-muted-foreground">redirect_uri</span>
                      <code
                        className="font-mono text-foreground/80 truncate"
                        title={p.redirect_uri}
                      >
                        {p.redirect_uri}
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="-my-1 h-6 w-6 shrink-0"
                        onClick={() => copy(p.redirect_uri)}
                        title="Скопировать redirect URI"
                        aria-label="Скопировать redirect URI"
                        data-testid={`login-copy-${p.provider}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>

                <div className="flex justify-end pt-1">
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
          <DialogDescription className="flex items-center gap-3">
            <span>Вход через {provider.provider}</span>
            {provider.docs_url && (
              <a
                href={provider.docs_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
                data-testid="login-docs-link"
              >
                где зарегистрировать
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </DialogDescription>
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
