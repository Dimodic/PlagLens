/**
 * /admin/integrations/oauth-providers — admin sets the global OAuth client
 * credentials (client_id / client_secret / redirect_uri / scope) per
 * provider. Once configured, every teacher can connect their integration
 * with a single click — they don't need to fill creds anymore.
 */
import { FormEvent, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react';
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
import { integrationsApi } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

interface ProviderRow {
  provider_kind: string;
  title: string;
  register_url: string | null;
  default_scope: string | null;
  default_redirect_uri: string | null;
  configured: boolean;
  client_id: string | null;
  client_secret_set: boolean;
  redirect_uri: string | null;
  scope: string | null;
  updated_at: string | null;
}

export default function OAuthProvidersPage() {
  useDocumentTitle('OAuth-провайдеры');
  const qc = useQueryClient();
  const notify = useNotifications();

  const { data, isPending, error } = useQuery({
    queryKey: ['admin', 'oauth-providers'],
    queryFn: () => integrationsApi.listOAuthProviders(),
  });
  const providers: ProviderRow[] = data?.data ?? [];

  const [editing, setEditing] = useState<ProviderRow | null>(null);

  const onSaved = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'oauth-providers'] });
    notify.success('Настройки OAuth-провайдера сохранены');
    setEditing(null);
  };

  const onDelete = async (row: ProviderRow) => {
    if (!confirm(`Удалить настройки ${row.title}?`)) return;
    try {
      await integrationsApi.deleteOAuthProvider(row.provider_kind);
      notify.success('Удалено');
      qc.invalidateQueries({ queryKey: ['admin', 'oauth-providers'] });
    } catch (e) {
      notify.error((e as Problem).title ?? 'Не удалось удалить');
    }
  };

  return (
    <Page width="regular">
      <PageHeader title="OAuth-провайдеры" />

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
          {providers.map((row) => (
            <Card
              key={row.provider_kind}
              className="border-border/70"
              data-testid={`oauth-provider-${row.provider_kind}`}
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">{row.title}</h3>
                      {row.configured ? (
                        <StatusPill tone="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          подключено
                        </StatusPill>
                      ) : (
                        <StatusPill tone="neutral">не настроено</StatusPill>
                      )}
                    </div>
                    <code className="mt-1 inline-block font-mono text-xs text-muted-foreground">
                      {row.provider_kind}
                    </code>
                  </div>
                  {row.register_url && (
                    <a
                      href={row.register_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      где зарегистрировать
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {row.configured ? (
                  <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-xs">
                    <dt className="text-muted-foreground">Client ID</dt>
                    <dd className="font-mono truncate">{row.client_id}</dd>
                    <dt className="text-muted-foreground">Secret</dt>
                    <dd className="font-mono">••••••••</dd>
                    <dt className="text-muted-foreground">Redirect URI</dt>
                    <dd className="font-mono truncate">{row.redirect_uri}</dd>
                    <dt className="text-muted-foreground">Scope</dt>
                    <dd className="font-mono">{row.scope ?? '—'}</dd>
                    <dt className="text-muted-foreground">Обновлено</dt>
                    <dd>
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleString('ru-RU')
                        : '—'}
                    </dd>
                  </dl>
                ) : null}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setEditing(row)}
                    data-testid={`oauth-edit-${row.provider_kind}`}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {row.configured ? 'Изменить' : 'Настроить'}
                  </Button>
                  {row.configured && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(row)}
                      data-testid={`oauth-delete-${row.provider_kind}`}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Удалить
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <ProviderEditDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
    </Page>
  );
}

interface DialogProps {
  row: ProviderRow;
  onClose: () => void;
  onSaved: () => void;
}

function ProviderEditDialog({ row, onClose, onSaved }: DialogProps) {
  const [clientId, setClientId] = useState(row.client_id ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState(
    row.redirect_uri ?? row.default_redirect_uri ?? '',
  );
  const [scope, setScope] = useState(row.scope ?? row.default_scope ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    setClientId(row.client_id ?? '');
    setClientSecret('');
    setRedirectUri(row.redirect_uri ?? row.default_redirect_uri ?? '');
    setScope(row.scope ?? row.default_scope ?? '');
  }, [row]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!clientId || !clientSecret || !redirectUri) {
      setProblem({
        title: 'Заполните все обязательные поля',
        detail: 'Client ID, Client Secret и Redirect URI обязательны.',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    setSubmitting(true);
    try {
      await integrationsApi.upsertOAuthProvider(row.provider_kind, {
        client_id: clientId.trim(),
        client_secret: clientSecret,
        redirect_uri: redirectUri.trim(),
        scope: scope.trim() || undefined,
      });
      onSaved();
    } catch (raw) {
      setProblem(raw as Problem);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{row.title}</DialogTitle>
          <DialogDescription>OAuth client</DialogDescription>
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
            <Label htmlFor="oauth-client-id">Client ID</Label>
            <Input
              id="oauth-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="font-mono text-xs"
              data-testid="oauth-client-id"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oauth-client-secret">
              Client Secret
              {row.client_secret_set && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (введите заново для замены)
                </span>
              )}
            </Label>
            <Input
              id="oauth-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="font-mono text-xs"
              data-testid="oauth-client-secret"
              placeholder={row.client_secret_set ? '••••••••' : ''}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oauth-redirect-uri">Redirect URI</Label>
            <Input
              id="oauth-redirect-uri"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="font-mono text-xs"
              data-testid="oauth-redirect-uri"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="oauth-scope">Scope</Label>
            <Input
              id="oauth-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="font-mono text-xs"
              data-testid="oauth-scope"
              placeholder={row.default_scope ?? ''}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="submit" disabled={submitting} data-testid="oauth-save">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
