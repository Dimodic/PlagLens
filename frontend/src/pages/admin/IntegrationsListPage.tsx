/**
 * /integrations — tenant-level integration overview.
 *
 * Redesign goal: stop reading as a "wall of identical rows". The
 * previous iteration was a single vertical divide-y list of 5
 * integrations followed by 10–20 nearly-identical history rows;
 * the user described it as "тяжело". This pass:
 *
 *   • Integrations as a 2-column quiet grid. Each tile is one row of
 *     text — no card chrome, no dividers, no icons. The grid layout
 *     itself breaks the vertical sameness.
 *   • Status surfaced ONLY when a tile needs attention (auth required
 *     / error / disabled). "Active" — the default — says nothing.
 *   • Hover surfaces actions (Запустить импорт / Проверить / ⋯).
 *   • History collapsed: one summary line per integration with counts
 *     and last-run time, instead of a chronological wall. Click a
 *     summary line → full per-integration history on the detail page.
 *
 * Same testids preserved so Playwright specs don't break.
 */
import { FormEvent, useEffect, useState } from 'react';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { SkeletonList } from '@/components/common/Skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import { cn } from '@/components/ui/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useDeleteIntegrationOAuthProvider,
  useIntegrationOAuthProviders,
  useUpsertIntegrationOAuthProvider,
} from '@/hooks/api/useAdminIntegrationsOauth';
import type {
  IntegrationOAuthKind,
  IntegrationOAuthProviderInfo,
} from '@/api/endpoints/adminIntegrationsOauth';
import { BrandIcon } from '@/components/icons/BrandIcon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  useCreateIntegration,
  useIntegrations,
} from '@/hooks/api/useIntegrations';
import {
  type IntegrationConfig,
  type IntegrationKind,
} from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';
import { TokenIntegrationDialog } from '@/components/integrations/TokenIntegrationDialog';
import { GoogleSheetsServiceAccountDialog } from '@/components/integrations/GoogleSheetsServiceAccountDialog';
import { CourseIntegrationDetail } from '@/components/integrations/CourseIntegrationDetail';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';

const KIND_TITLES: Record<IntegrationKind, string> = {
  yandex_contest: 'Yandex.Contest',
  stepik: 'Stepik',
  ejudge: 'eJudge',
  manual: 'Ручная загрузка',
  telegram: 'Telegram',
  google_sheets: 'Google Sheets',
};

interface CourseIntegrationsPanelProps {
  items: IntegrationConfig[];
  isPending: boolean;
  error: Problem | null;
  /** eJudge / Manual connect by token — opens the page-level modal. */
  onTokenConnect: (kind: IntegrationKind) => void;
  onChanged: () => void;
}

/** Every source a teacher can connect, in the order they appear in the
 *  left menu. The menu lists them all (configured or not), like the
 *  admin OAuth panel — there's no separate «+ Подключить» button. */
const CONNECTABLE_KINDS: IntegrationKind[] = [
  'yandex_contest',
  'stepik',
  'google_sheets',
  'ejudge',
  'manual',
];

/** Teacher integrations — master-detail, same shape as the admin OAuth
 *  panel: ALL sources on the left (connected or not); the right pane is
 *  the selected source's sync/autosync controls, a «connect» prompt if
 *  it isn't set up yet, or a placeholder until something is selected. */
function CourseIntegrationsPanel({
  items,
  isPending,
  error,
  onTokenConnect,
  onChanged,
}: CourseIntegrationsPanelProps) {
  // Nothing selected by default — keeps the page calm and shows the
  // «выберите интеграцию» hint instead of dumping one source's controls.
  const [selectedKind, setSelectedKind] = useState<IntegrationKind | null>(null);

  if (error) return <ProblemAlert problem={error} />;
  if (isPending) return <SkeletonList rows={5} rowHeight={56} />;

  const configFor = (kind: IntegrationKind) =>
    items.find((i) => i.kind === kind) ?? null;
  const selectedConfig = selectedKind ? configFor(selectedKind) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
      <nav aria-label="Интеграции курса" className="flex flex-col py-2">
        {CONNECTABLE_KINDS.map((kind) => {
          const cfg = configFor(kind);
          const connected = !!cfg && cfg.status === 'active';
          const isSel = kind === selectedKind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => setSelectedKind(kind)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors',
                isSel ? 'bg-muted/40' : 'hover:bg-muted/20',
              )}
              data-testid={`integration-kind-${kind}`}
              aria-current={isSel ? 'page' : undefined}
            >
              <ProviderIcon kind={kind} className="h-5 w-5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {KIND_TITLES[kind] ?? kind}
                </span>
                <span
                  className={cn(
                    'block text-xs truncate',
                    connected
                      ? 'text-muted-foreground'
                      : cfg
                        ? 'text-sev-mid font-medium'
                        : 'text-muted-foreground/60',
                  )}
                >
                  {connected
                    ? 'подключено'
                    : cfg
                      ? 'ожидает авторизации'
                      : 'не подключено'}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="md:border-l md:border-border/60 p-6 md:p-8 md:min-h-[420px]">
        {!selectedKind ? (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              Выберите интеграцию слева, чтобы настроить синхронизацию или
              подключить новый источник.
            </p>
          </div>
        ) : selectedConfig ? (
          // key per source so switching sources gives each pane fresh
          // state (no stale inline error / course selection bleed-through).
          <CourseIntegrationDetail
            key={selectedConfig.id}
            integration={selectedConfig}
            onChanged={onChanged}
          />
        ) : (
          <ConnectPrompt
            key={selectedKind}
            kind={selectedKind}
            onTokenConnect={onTokenConnect}
          />
        )}
      </div>
    </div>
  );
}

/** Right-pane prompt for a not-yet-connected source.
 *
 *  OAuth kinds (yc/stepik/sheets) connect inline. When the admin hasn't
 *  set up the provider's app the backend refuses with a 409 (no config
 *  is created) — we show that reason inline on the page, not as a toast.
 *  Token kinds defer to the page's modal. */
function ConnectPrompt({
  kind,
  onTokenConnect,
}: {
  kind: IntegrationKind;
  onTokenConnect: (kind: IntegrationKind) => void;
}) {
  const createMut = useCreateIntegration();
  const [problem, setProblem] = useState<string | null>(null);

  const title = KIND_TITLES[kind] ?? kind;
  const viaOauth =
    kind === 'yandex_contest' || kind === 'stepik' || kind === 'google_sheets';
  const busy = createMut.isPending;

  const connect = () => {
    if (!viaOauth) {
      onTokenConnect(kind);
      return;
    }
    setProblem(null);
    createMut.mutate(
      { kind, display_name: title, settings: {} },
      {
        onSuccess: (res) => {
          if (res.oauth_authorize_url) {
            window.location.assign(res.oauth_authorize_url);
            return;
          }
          // Defensive — backend now 409s when unconfigured, so this
          // branch shouldn't fire.
          setProblem(
            'OAuth для этого источника ещё не настроен. Попросите администратора заполнить ключи в «Интеграции → Авторизация».',
          );
        },
        onError: (p) => {
          const pr = p as unknown as Problem;
          setProblem(pr.detail || pr.title || 'Не удалось подключить');
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <ProviderIcon kind={kind} className="h-7 w-7 shrink-0" />
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground/60">не подключено</span>
      </header>
      <p className="max-w-md text-sm text-muted-foreground">
        {viaOauth
          ? 'Подключение откроет страницу авторизации провайдера. После входа источник появится здесь, и можно будет настроить синхронизацию.'
          : 'Подключите источник по токену или загрузите архив с решениями.'}
      </p>
      {problem && (
        <p role="alert" className="max-w-md text-sm text-destructive">
          {problem}
        </p>
      )}
      <Button
        onClick={connect}
        disabled={busy}
        data-testid={`integration-connect-${kind}`}
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Подключить
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Page                                                              */

export function IntegrationsListPage() {
  useDocumentTitle('Интеграции');
  const { user } = useAuth();
  const isAdmin = user?.global_role === 'admin';
  const { data, isPending, error, refetch } = useIntegrations({ limit: 100 });
  const items = data?.data ?? [];

  // Which kind the inline token dialog is currently editing. ``null`` →
  // dialog closed. Opened from the «Подключить» button for eJudge / Manual.
  const [tokenDialogKind, setTokenDialogKind] = useState<IntegrationKind | null>(
    null,
  );

  return (
    <Page width="regular">
      <PageHeader
        title={
          <span data-testid="integrations-title">
            {isAdmin ? 'Интеграции' : 'Интеграции курса'}
          </span>
        }
      />

      {isAdmin ? (
        // Admin sees only the OAuth-apps directory — no "Источники" tab.
        // Per UX call: admin sets up credentials; teachers create the
        // actual integration rows in their courses.
        <OAuthProvidersPanel />
      ) : (
        // Teacher: master-detail like the admin page — every source in the
        // left menu (connected or not), sync / autosync (or a connect
        // prompt) on the right.
        <CourseIntegrationsPanel
          items={items}
          isPending={isPending && !data}
          error={(error as unknown as Problem) ?? null}
          onTokenConnect={(kind) => setTokenDialogKind(kind)}
          onChanged={() => refetch()}
        />
      )}

      <TokenIntegrationDialog
        open={tokenDialogKind !== null}
        kind={tokenDialogKind}
        onOpenChange={(o) => {
          if (!o) setTokenDialogKind(null);
        }}
      />
    </Page>
  );
}

/* ----------------------------------------------------------------- */
/* OAuth providers — admin-only master-detail. Sidebar lists the three
 * import providers; the detail pane edits credentials inline (no modal).
 * Same shape as /admin/login-providers, tweaked for the PUT-style upsert
 * contract (client_id + client_secret + redirect_uri all required).
 */

const INTEGRATION_OAUTH_ORDER: IntegrationOAuthKind[] = [
  'yandex_contest',
  'stepik',
  'google_sheets',
];

function OAuthProvidersPanel() {
  const { data, isLoading, error } = useIntegrationOAuthProviders();
  const [selectedId, setSelectedId] = useState<IntegrationOAuthKind | null>(
    null,
  );

  const providers = (data ?? [])
    .filter((p): p is IntegrationOAuthProviderInfo =>
      INTEGRATION_OAUTH_ORDER.includes(
        p.provider_kind as IntegrationOAuthKind,
      ),
    )
    .sort(
      (a, b) =>
        INTEGRATION_OAUTH_ORDER.indexOf(a.provider_kind) -
        INTEGRATION_OAUTH_ORDER.indexOf(b.provider_kind),
    );

  useEffect(() => {
    if (selectedId === null && providers.length > 0) {
      setSelectedId(providers[0].provider_kind);
    }
  }, [selectedId, providers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <ProblemAlert problem={error as unknown as Problem} />;
  }

  const selected = providers.find((p) => p.provider_kind === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
        <nav
          aria-label="OAuth-провайдеры интеграций"
          className="flex flex-col py-2"
        >
          {providers.map((p) => {
            const isSelected = p.provider_kind === selectedId;
            return (
              <button
                key={p.provider_kind}
                type="button"
                onClick={() => setSelectedId(p.provider_kind)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors',
                  isSelected ? 'bg-muted/40' : 'hover:bg-muted/20',
                )}
                data-testid={`integration-oauth-provider-${p.provider_kind}`}
                aria-current={isSelected ? 'page' : undefined}
              >
                <BrandIcon
                  provider={p.provider_kind}
                  className="h-5 w-5 shrink-0 text-foreground/80"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">
                    {p.title}
                  </div>
                  <div
                    className={cn(
                      'text-xs truncate',
                      p.configured
                        ? 'text-muted-foreground'
                        : 'text-sev-mid font-medium',
                    )}
                  >
                    {p.configured ? 'настроено' : 'не настроено'}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        <div className="md:border-l md:border-border/60 p-6 md:p-8 md:min-h-[480px]">
          {selected ? (
            <IntegrationOAuthDetail provider={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Выберите провайдера слева.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface DetailProps {
  provider: IntegrationOAuthProviderInfo;
}

function IntegrationOAuthDetail({ provider }: DetailProps) {
  const notify = useNotifications();
  const upsert = useUpsertIntegrationOAuthProvider();
  const remove = useDeleteIntegrationOAuthProvider();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [scope, setScope] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  // Google Sheets has a second tenant-wide path (Service Account JSON)
  // that no other provider needs. The button only renders for Sheets and
  // its modal lives next to this form so the trigger and the dialog
  // can't drift out of sync.
  const [saDialogOpen, setSaDialogOpen] = useState(false);

  // Pre-fill from the provider snapshot whenever the selection changes.
  // The backend's PUT contract requires all of client_id + client_secret +
  // redirect_uri on every save, so we surface the existing client_id /
  // redirect_uri pre-filled and ask the admin to re-enter the secret.
  useEffect(() => {
    setClientId(provider.client_id ?? '');
    setClientSecret('');
    setRedirectUri(provider.redirect_uri ?? provider.default_redirect_uri ?? '');
    setScope(provider.scope ?? '');
    setProblem(null);
  }, [provider.provider_kind, provider.client_id, provider.redirect_uri, provider.default_redirect_uri, provider.scope]);

  const copyRedirect = () => {
    if (redirectUri && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(redirectUri);
      notify.info('Redirect URI скопирован');
    }
  };

  const canSave =
    !!clientId.trim() && !!clientSecret.trim() && !!redirectUri.trim();

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!canSave) {
      setProblem({
        title: 'Заполните Client ID, Client Secret и Redirect URI',
        detail:
          'Бэкенд хранит все три поля вместе — секрет нельзя обновить отдельно.',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    try {
      await upsert.mutateAsync({
        kind: provider.provider_kind,
        payload: {
          client_id: clientId.trim(),
          client_secret: clientSecret.trim(),
          redirect_uri: redirectUri.trim(),
          scope: scope.trim() || null,
        },
      });
      notify.success(`${provider.title}: ключи сохранены`);
      setClientSecret('');
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  const onRemove = async () => {
    if (!confirm(`Удалить OAuth-приложение «${provider.title}»?`)) return;
    try {
      await remove.mutateAsync(provider.provider_kind);
      notify.success(`${provider.title}: приложение удалено`);
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось удалить');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <BrandIcon
          provider={provider.provider_kind}
          className="h-7 w-7 shrink-0 text-foreground/80"
        />
        <h2 className="text-xl font-semibold text-foreground">
          {provider.title}
        </h2>
        {provider.register_url && (
          <a
            href={provider.register_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Где зарегистрировать приложение"
            aria-label="Где зарегистрировать приложение"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            data-testid={`integration-oauth-register-${provider.provider_kind}`}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
        <span
          className={cn(
            'ml-auto text-xs',
            provider.configured
              ? 'text-muted-foreground'
              : 'text-sev-mid font-medium',
          )}
        >
          {provider.configured ? 'настроено' : 'не настроено'}
        </span>
      </header>

      <form onSubmit={onSave} className="space-y-4" noValidate>
        {problem && (
          <Alert variant="destructive">
            <AlertTitle>{problem.title}</AlertTitle>
            {problem.detail && (
              <AlertDescription>{problem.detail}</AlertDescription>
            )}
          </Alert>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="iov-client-id">Client ID</Label>
          <Input
            id="iov-client-id"
            value={clientId}
            onChange={(e) => setClientId(e.currentTarget.value)}
            autoComplete="off"
            className="font-mono text-xs"
            data-testid="integration-oauth-edit-client-id"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="iov-client-secret">
            Client Secret
            {provider.client_secret_set && (
              <span className="ml-2 text-xs text-muted-foreground">
                (введите заново для замены)
              </span>
            )}
          </Label>
          <Input
            id="iov-client-secret"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.currentTarget.value)}
            type="password"
            className="font-mono text-xs"
            placeholder={provider.client_secret_set ? '••••••••' : ''}
            autoComplete="new-password"
            data-testid="integration-oauth-edit-client-secret"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Redirect URI</Label>
          <div
            className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-2"
            data-testid="integration-oauth-edit-redirect-uri"
          >
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/80">
              {redirectUri}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-my-1 h-7 w-7 shrink-0"
              onClick={copyRedirect}
              title="Скопировать"
              aria-label="Скопировать redirect URI"
              data-testid={`integration-oauth-copy-${provider.provider_kind}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Это наш фиксированный адрес — только скопируйте.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="iov-scope">Scope</Label>
          <Input
            id="iov-scope"
            value={scope}
            onChange={(e) => setScope(e.currentTarget.value)}
            autoComplete="off"
            className="font-mono text-xs"
            placeholder={provider.default_scope ?? ''}
            data-testid="integration-oauth-edit-scope"
          />
          <p className="text-xs text-muted-foreground">
            По умолчанию{' '}
            <code className="font-mono">{provider.default_scope ?? '—'}</code>.
            Широкий scope = меньше подтверждений у преподавателя.
          </p>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {/* Google-Sheets-only: opens the SA-JSON modal. Lives in the
                bottom-left of the Sheets detail panel, so it appears in
                context (only when admin is actually looking at Sheets)
                instead of competing for sidebar real-estate. */}
            {provider.provider_kind === 'google_sheets' && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSaDialogOpen(true)}
                className="text-muted-foreground hover:text-foreground"
                data-testid="integration-oauth-google-sheets-sa"
              >
                Сервисный аккаунт (JSON)
              </Button>
            )}
            {provider.configured && (
              <Button
                type="button"
                variant="ghost"
                onClick={onRemove}
                disabled={upsert.isPending || remove.isPending}
                className="text-destructive hover:text-destructive"
              >
                Удалить приложение
              </Button>
            )}
          </div>
          <Button
            type="submit"
            disabled={!canSave || upsert.isPending}
            data-testid="integration-oauth-edit-save"
          >
            {upsert.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Сохранить
          </Button>
        </div>
      </form>

      {provider.provider_kind === 'google_sheets' && (
        <GoogleSheetsServiceAccountDialog
          open={saDialogOpen}
          onOpenChange={setSaDialogOpen}
        />
      )}
    </div>
  );
}

export default IntegrationsListPage;
