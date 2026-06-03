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
import { Copy, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Skeleton } from '@/components/ui/skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import { cn } from '@/components/ui/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { t, useTranslation, type TParams } from '@/i18n';
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
import { ManualUploadPanel } from '@/components/integrations/ManualUploadPanel';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { AiProviderPanel } from '@/components/admin/AiProviderPanel';
import { useMyAiProviders } from '@/hooks/api/useAi';

const KIND_BRAND_TITLES: Record<Exclude<IntegrationKind, 'manual'>, string> = {
  yandex_contest: 'Yandex.Contest',
  stepik: 'Stepik',
  ejudge: 'eJudge',
  telegram: 'Telegram',
  google_sheets: 'Google Sheets',
};

/** Display title for an integration kind. Brand names are locale-neutral
 *  constants; only the «manual» pseudo-source has translated copy. Resolved
 *  at render time (not module scope) so it tracks the active locale. */
function kindTitle(
  t: (key: string, params?: TParams) => string,
  kind: IntegrationKind,
): string {
  if (kind === 'manual') return t('integrations_list.kind_manual');
  return KIND_BRAND_TITLES[kind] ?? kind;
}

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

/** Loading placeholder for both master-detail panels (teacher sources &
 *  admin OAuth apps). Mirrors the real `grid-cols-[260px_1fr]` shape: a
 *  left nav of icon + two-line buttons and a bordered detail pane, so the
 *  layout doesn't reflow when data lands. `navRows` ≈ the real menu length;
 *  `detailMinH` matches the pane's `md:min-h-[…]`. */
function MasterDetailSkeleton({
  navRows,
  detailMinH,
}: {
  navRows: number;
  detailMinH: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={t('skeleton.aria_label')}
      className="grid grid-cols-1 md:grid-cols-[260px_1fr]"
    >
      <div className="flex flex-col px-2 py-2">
        {Array.from({ length: navRows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-5 w-5 shrink-0 rounded bg-muted/40" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3 rounded bg-muted/40" />
              <Skeleton className="h-3 w-1/3 rounded bg-muted/30" />
            </div>
          </div>
        ))}
      </div>
      <div
        className={cn('space-y-5 p-6 md:border-l md:border-border/60 md:p-8', detailMinH)}
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 shrink-0 rounded bg-muted/40" />
          <Skeleton className="h-6 w-40 rounded bg-muted/40" />
        </div>
        <Skeleton className="h-3 w-3/4 rounded bg-muted/30" />
        <Skeleton className="h-3 w-1/2 rounded bg-muted/30" />
      </div>
    </div>
  );
}

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
  const { t } = useTranslation();
  // Nothing selected by default — keeps the page calm and shows the
  // «выберите интеграцию» hint instead of dumping one source's controls.
  // 'ai' is a pseudo-kind: the teacher's own LLM connection (not a sync
  // source) shares this menu since it's conceptually "connect a service".
  const [selectedKind, setSelectedKind] = useState<
    IntegrationKind | 'ai' | null
  >(null);
  // Status dot for the «ИИ» menu item — "подключено" only when there's an
  // active provider with a stored key.
  const { data: myAi } = useMyAiProviders();
  const aiConnected = (myAi ?? []).some((p) => p.active && p.has_key);

  if (error) return <ProblemAlert problem={error} />;
  // Mirror the master-detail grid: 5 sources + the AI item in the left
  // nav, detail pane min-height matching the loaded pane below.
  if (isPending)
    return (
      <MasterDetailSkeleton
        navRows={CONNECTABLE_KINDS.length + 1}
        detailMinH="md:min-h-[420px]"
      />
    );

  // Only an ACTIVE config counts as "connected". A lingering
  // ``pending_auth`` row (an OAuth flow started but not finished) is
  // treated as not-connected — OAuth completes instantly on the redirect,
  // so there's no meaningful "ожидает авторизации" state to surface; the
  // user just (re)clicks «Подключить».
  const configFor = (kind: IntegrationKind) =>
    items.find((i) => i.kind === kind && i.status === 'active') ?? null;
  const selectedConfig =
    selectedKind && selectedKind !== 'ai' ? configFor(selectedKind) : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
      <nav
        aria-label={t('integrations_list.course_nav_aria')}
        className="flex flex-col px-2 py-2"
      >
        {CONNECTABLE_KINDS.map((kind) => {
          const cfg = configFor(kind);
          const connected = !!cfg && cfg.status === 'active';
          const isSel = kind === selectedKind;
          // Manual upload isn't a "connection" — it's always available;
          // show a neutral label instead of a connect status.
          const isManualKind = kind === 'manual';
          const subtitle = isManualKind
            ? t('integrations_list.manual_subtitle')
            : connected
              ? t('integrations_list.connected')
              : t('integrations_list.not_connected');
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
                  {kindTitle(t, kind)}
                </span>
                <span
                  className={cn(
                    'block text-xs truncate',
                    isManualKind || connected
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/60',
                  )}
                >
                  {subtitle}
                </span>
              </span>
            </button>
          );
        })}

        {/* AI provider — not an import source (it's analysis tooling), so
            it's set apart from the sources by a hairline divider instead of
            sitting in the same list. Same page, not a separate tab. */}
        <div className="mx-2 my-2 border-t border-border/40" />
        <button
          type="button"
          onClick={() => setSelectedKind('ai')}
          className={cn(
            'flex w-full items-center gap-3 rounded-md px-4 py-3 text-left transition-colors',
            selectedKind === 'ai' ? 'bg-muted/40' : 'hover:bg-muted/20',
          )}
          data-testid="integration-kind-ai"
          aria-current={selectedKind === 'ai' ? 'page' : undefined}
        >
          <Sparkles className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">
              {t('integrations_list.ai_title')}
            </span>
            <span
              className={cn(
                'block truncate text-xs',
                aiConnected
                  ? 'text-muted-foreground'
                  : 'text-muted-foreground/60',
              )}
            >
              {aiConnected
                ? t('integrations_list.connected')
                : t('integrations_list.not_connected')}
            </span>
          </span>
        </button>
      </nav>

      <div className="md:border-l md:border-border/60 p-6 md:p-8 md:min-h-[420px]">
        {!selectedKind ? (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <p className="max-w-xs text-center text-sm text-muted-foreground">
              {t('integrations_list.select_hint')}
            </p>
          </div>
        ) : selectedKind === 'ai' ? (
          <AiProviderPanel />
        ) : selectedKind === 'manual' ? (
          // Manual upload needs no connection — straight to the upload pane.
          <ManualUploadPanel />
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
  const { t } = useTranslation();
  const createMut = useCreateIntegration();
  const [problem, setProblem] = useState<string | null>(null);

  const title = kindTitle(t, kind);
  const isOauth =
    kind === 'yandex_contest' || kind === 'stepik' || kind === 'google_sheets';
  const busy = createMut.isPending;

  const connect = () => {
    // eJudge needs a server URL + token up front → defer to the modal.
    if (kind === 'ejudge') {
      onTokenConnect(kind);
      return;
    }
    // OAuth sources create the row inline, then redirect to the provider.
    setProblem(null);
    createMut.mutate(
      { kind, display_name: title, settings: {} },
      {
        onSuccess: (res) => {
          if (res.oauth_authorize_url) {
            window.location.assign(res.oauth_authorize_url);
            return;
          }
          // Defensive — backend 409s when the provider isn't configured,
          // so a success without a URL shouldn't happen.
          setProblem(t('integrations_list.oauth_not_configured'));
        },
        onError: (p) => {
          const pr = p as unknown as Problem;
          setProblem(pr.detail || pr.title || t('integrations_list.connect_failed'));
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        <ProviderIcon kind={kind} className="h-7 w-7 shrink-0" />
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground/60">
          {t('integrations_list.not_connected')}
        </span>
      </header>
      <p className="max-w-md text-sm text-muted-foreground">
        {isOauth
          ? t('integrations_list.oauth_connect_hint')
          : t('integrations_list.ejudge_connect_hint')}
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
        {t('integrations_list.connect')}
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Page                                                              */

export function IntegrationsListPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('integrations_list.title'));
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
            {isAdmin
              ? t('integrations_list.title')
              : t('integrations_list.title_course')}
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
  const { t } = useTranslation();
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
    // Same master-detail shape as the loaded panel: the 3 OAuth providers
    // in the left nav, detail pane min-height matching the form below.
    return (
      <MasterDetailSkeleton
        navRows={INTEGRATION_OAUTH_ORDER.length}
        detailMinH="md:min-h-[480px]"
      />
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
          aria-label={t('integrations_list.oauth_nav_aria')}
          className="flex flex-col px-2 py-2"
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
                    {p.configured
                      ? t('integrations_list.configured')
                      : t('integrations_list.not_configured')}
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
              {t('integrations_list.select_provider_hint')}
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
  const { t } = useTranslation();
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
      notify.info(t('integrations_list.redirect_copied'));
    }
  };

  const canSave =
    !!clientId.trim() && !!clientSecret.trim() && !!redirectUri.trim();

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!canSave) {
      setProblem({
        title: t('integrations_list.fill_all_fields_title'),
        detail: t('integrations_list.fill_all_fields_detail'),
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
      notify.success(t('integrations_list.keys_saved', { name: provider.title }));
      setClientSecret('');
    } catch (raw) {
      setProblem(raw as Problem);
    }
  };

  const onRemove = async () => {
    if (!confirm(t('integrations_list.delete_confirm', { name: provider.title })))
      return;
    try {
      await remove.mutateAsync(provider.provider_kind);
      notify.success(t('integrations_list.app_deleted', { name: provider.title }));
    } catch (e) {
      notify.error(
        (e as Problem)?.detail ?? t('integrations_list.delete_failed'),
      );
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
            title={t('integrations_list.register_app')}
            aria-label={t('integrations_list.register_app')}
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
          {provider.configured
            ? t('integrations_list.configured')
            : t('integrations_list.not_configured')}
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
                {t('integrations_list.reenter_to_replace')}
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
              title={t('integrations_list.copy')}
              aria-label={t('integrations_list.copy_redirect_aria')}
              data-testid={`integration-oauth-copy-${provider.provider_kind}`}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
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
            {t('integrations_list.scope_default_prefix')}{' '}
            <code className="font-mono">{provider.default_scope ?? '—'}</code>.{' '}
            {t('integrations_list.scope_hint')}
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
                {t('integrations_list.service_account')}
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
                {t('integrations_list.delete_app')}
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
            {t('integrations_list.save')}
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
