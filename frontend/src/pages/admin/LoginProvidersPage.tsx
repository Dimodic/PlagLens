/**
 * /admin/login-providers — admin sets the social-login OAuth client
 * credentials (client_id / client_secret) per provider so that students
 * and teachers can register / sign in with a single click.
 *
 * This is the LOGIN side of OAuth (Google / Yandex / GitHub / Telegram
 * sign-in buttons on the auth screen). It's distinct from
 * /admin/integrations (the IMPORT side — Y.Contest / Stepik / Sheets data
 * pulls). Stepik is deliberately excluded here: it's an import provider,
 * not a login button, even though the identity API may list it.
 *
 * Mirrors the integration OAuth-providers directory
 * (/admin/integrations/oauth-providers) — same card / dialog / StatusPill
 * layout — but points at the identity `/admin/oauth/providers` endpoint
 * via `useAdminOAuth`. The secret is write-only: we never echo it back.
 */
import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusPill } from '@/components/common/StatusPill';
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

/** A provider is "configured" once a client_id (preview) is present. The
 *  secret is write-only so it can't be the readiness signal here. */
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
    if (typeof navigator !== 'undefined' && navigator.clipboard && text) {
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
        <Card className="border-border/70">
          <CardContent className="p-8 flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Загружаем…
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {providers.map((p) => {
            const configured = isConfigured(p);
            return (
              <Card
                key={p.provider}
                className="border-border/70"
                data-testid={`login-provider-${p.provider}`}
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold">{p.title}</h3>
                        {configured ? (
                          <StatusPill tone="success">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            настроено
                          </StatusPill>
                        ) : (
                          <StatusPill tone="neutral">не настроено</StatusPill>
                        )}
                      </div>
                      <code className="mt-1 inline-block font-mono text-xs text-muted-foreground">
                        {p.provider}
                      </code>
                    </div>
                    {p.docs_url && (
                      <a
                        href={p.docs_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        где зарегистрировать
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>

                  {configured && (
                    <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Client ID</dt>
                      <dd className="font-mono truncate">
                        {p.client_id_preview}
                      </dd>
                      <dt className="text-muted-foreground">Secret</dt>
                      <dd className="font-mono">
                        {p.has_secret ? '••••••••' : '—'}
                      </dd>
                    </dl>
                  )}

                  {p.redirect_uri && (
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={p.redirect_uri}
                        className="font-mono text-xs"
                        data-testid={`login-redirect-uri-${p.provider}`}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        onClick={() => copy(p.redirect_uri)}
                        title="Скопировать redirect URI"
                        aria-label="Скопировать redirect URI"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setEditing(p)}
                      disabled={!p.editable}
                      title={
                        p.editable
                          ? undefined
                          : 'Этот провайдер настраивается через переменные окружения'
                      }
                      data-testid={`login-edit-${p.provider}`}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      {configured ? 'Изменить' : 'Настроить'}
                    </Button>
                    {!p.editable && (
                      <span className="text-xs text-muted-foreground">
                        только через env
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
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
    // For a brand-new provider the admin must supply both. When editing an
    // already-configured one, either field may be left blank to keep its
    // current value — but at least one must change.
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
          // undefined → leave unchanged (matches the endpoint contract).
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
              <Input
                id="login-redirect-uri-dialog"
                readOnly
                value={provider.redirect_uri}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Скопируйте этот URL в настройки приложения у провайдера.
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
