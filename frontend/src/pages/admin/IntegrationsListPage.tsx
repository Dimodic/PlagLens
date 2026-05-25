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
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useQueries } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonList } from '@/components/common/Skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/components/ui/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useOAuthProviders, useUpdateOAuthProvider } from '@/hooks/api/useAdminOAuth';
import type { OAuthProviderInfo } from '@/api/endpoints/adminOAuth';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useCreateIntegration,
  useDeleteIntegration,
  useDisableIntegration,
  useEnableIntegration,
  useIntegrations,
  useSyncNow,
  useTestIntegration,
} from '@/hooks/api/useIntegrations';
import {
  integrationsApi,
  type IntegrationConfig,
  type IntegrationKind,
  type IntegrationStatus,
} from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';
import { TokenIntegrationDialog } from '@/components/integrations/TokenIntegrationDialog';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';

const KIND_TITLES: Record<IntegrationKind, string> = {
  yandex_contest: 'Yandex.Contest',
  stepik: 'Stepik',
  ejudge: 'eJudge',
  manual: 'Ручная загрузка',
  telegram: 'Telegram',
  google_sheets: 'Google Sheets',
};

// Status surfacing is opinionated: "active" is the default — saying so
// on every tile is noise. We only emit a label when the tile needs
// attention (auth required, error, manually disabled).
const STATUS_PROBLEM: Record<
  IntegrationStatus | string,
  { label: string; tone: string } | null
> = {
  active: null,
  pending_auth: { label: 'нужна авторизация', tone: 'text-sev-mid' },
  error: { label: 'ошибка', tone: 'text-sev-high' },
  disabled: { label: 'отключено', tone: 'text-muted-foreground/70' },
};

/** Slice an array into pairs. The last pair may have a single element
 *  when the input is odd-length — the grid renders it as a lone tile
 *  on the left of its row, which is fine; the empty cell collapses
 *  invisibly. */
function chunkPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    out.push(arr.slice(i, i + 2));
  }
  return out;
}

function openLink(integration: IntegrationConfig): string {
  if (integration.kind === 'yandex_contest') {
    return `/integrations/yandex-contest/${integration.id}/contests`;
  }
  // Detail page is mounted at both /integrations/:id (teacher+admin) and
  // /admin/integrations/:id (admin only). Use the teacher-friendly mirror.
  return `/integrations/${integration.id}`;
}

interface TileProps {
  integration: IntegrationConfig;
  onChanged: () => void;
}

function IntegrationTile({ integration, onChanged }: TileProps) {
  const notify = useNotifications();
  const test = useTestIntegration();
  const enableM = useEnableIntegration();
  const disableM = useDisableIntegration();
  const deleteM = useDeleteIntegration();
  const syncM = useSyncNow(integration.id);

  const isActive = integration.status === 'active';
  const title = KIND_TITLES[integration.kind] ?? integration.kind;
  const customName =
    integration.display_name && integration.display_name !== title
      ? integration.display_name
      : null;
  const problem = STATUS_PROBLEM[integration.status];

  const onTest = async () => {
    try {
      const res = await test.mutateAsync(integration.id);
      const why = res.detail ?? res.message;
      if (res.ok) notify.success(why ?? 'Подключение работает');
      else
        notify.error(
          why ? `Подключение не отвечает: ${why}` : 'Подключение не отвечает',
        );
      onChanged();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onSync = async () => {
    try {
      await syncM.mutateAsync({});
      notify.success('Импорт запущен в фоне');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onToggle = async () => {
    try {
      if (isActive) {
        await disableM.mutateAsync(integration.id);
        notify.success('Интеграция отключена');
      } else {
        await enableM.mutateAsync(integration.id);
        notify.success('Интеграция включена');
      }
      onChanged();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const onDelete = async () => {
    if (
      !confirm(
        `Удалить интеграцию «${integration.display_name}»? Это действие необратимо.`,
      )
    ) {
      return;
    }
    try {
      await deleteM.mutateAsync(integration.id);
      notify.success('Интеграция удалена');
      onChanged();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось удалить');
    }
  };

  return (
    <div
      data-testid={`integration-row-${integration.id}`}
      className="group relative -mx-2 rounded-md px-2 py-2 transition-colors hover:bg-muted/30"
    >
      <Link
        to={openLink(integration)}
        className="absolute inset-0 z-0 rounded-md"
        aria-label={`Открыть ${title}`}
      />
      <div className="relative z-0 pointer-events-none flex items-baseline gap-2">
        <h3 className="text-sm font-medium text-foreground truncate">
          {title}
        </h3>
        {customName && (
          <span className="text-xs text-muted-foreground truncate">
            {customName}
          </span>
        )}
        {problem && (
          <span
            className={cn('ml-auto text-xs flex-none', problem.tone)}
            data-testid={`integration-status-${integration.id}`}
          >
            {problem.label}
          </span>
        )}
      </div>
      <p className="relative z-0 pointer-events-none mt-0.5 text-xs text-muted-foreground truncate">
        {integration.course_id
          ? `Курс #${integration.course_id}`
          : 'Без курса'}
        {' · '}
        {integration.last_sync_at
          ? `последний импорт ${dayjs(integration.last_sync_at).format('D MMM')}`
          : 'импортов ещё не было'}
      </p>
      {integration.last_sync_error && (
        <p className="relative z-0 pointer-events-none mt-1 flex items-start gap-1 text-xs text-sev-high">
          <AlertCircle className="mt-0.5 h-3 w-3 flex-none" />
          <span className="break-words">
            {integration.last_sync_error}
          </span>
        </p>
      )}
      <div className="relative z-10 mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onSync}
          disabled={syncM.isPending || !isActive}
          aria-label="Запустить импорт"
          title={
            !isActive ? 'Сначала активируйте интеграцию' : 'Запустить импорт'
          }
        >
          <PlayCircle className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onTest}
          disabled={test.isPending}
          aria-label="Проверить подключение"
          title="Проверить подключение"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              data-testid={`integration-menu-${integration.id}`}
              aria-label="Ещё действия"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={onToggle}
              disabled={enableM.isPending || disableM.isPending}
            >
              <Power className="mr-2 h-4 w-4" />
              {isActive ? 'Отключить' : 'Включить'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              disabled={deleteM.isPending}
              className="text-destructive focus:text-destructive"
              data-testid={`integration-delete-${integration.id}`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Activity summary — one row per integration, not per import.       */

interface ActivitySummaryProps {
  integrations: IntegrationConfig[];
}

function ActivitySummary({ integrations }: ActivitySummaryProps) {
  const jobQueries = useQueries({
    queries: integrations.map((it) => ({
      queryKey: ['integration', it.id, 'jobs', { limit: 30 }],
      queryFn: () => integrationsApi.listImportJobs(it.id, { limit: 30 }),
      enabled: !!it.id,
      refetchInterval: 15_000,
    })),
  });

  const groups = integrations
    .map((it, idx) => {
      const jobs = jobQueries[idx]?.data?.data ?? [];
      if (jobs.length === 0) return null;
      const completed = jobs.filter((j) => j.status === 'completed').length;
      const failed = jobs.filter((j) => j.status === 'failed').length;
      const running = jobs.filter((j) => j.status === 'running').length;
      const queued = jobs.filter((j) => j.status === 'queued').length;
      const lastAt = jobs[0]?.started_at ?? jobs[0]?.finished_at ?? null;
      const title = KIND_TITLES[it.kind] ?? it.kind;
      return {
        integration: it,
        title,
        total: jobs.length,
        completed,
        failed,
        running,
        queued,
        lastAt,
      };
    })
    .filter(Boolean) as Array<{
    integration: IntegrationConfig;
    title: string;
    total: number;
    completed: number;
    failed: number;
    running: number;
    queued: number;
    lastAt: string | null;
  }>;

  if (groups.length === 0) return null;

  return (
    <section className="space-y-3 border-t border-border/60 pt-6">
      <h2 className="text-base font-semibold text-foreground">
        Активность
      </h2>
      <ul className="flex flex-col gap-1" data-testid="imports-history">
        {groups.map((g) => (
          <li key={g.integration.id} data-testid={`imports-summary-${g.integration.id}`}>
            <Link
              to={openLink(g.integration)}
              className="group flex items-baseline gap-2 -mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/30"
            >
              <span className="text-sm font-medium text-foreground truncate">
                {g.title}
              </span>
              <span className="text-xs text-muted-foreground truncate">
                {summarise(g)}
              </span>
              <ChevronRight
                className="ml-auto h-3.5 w-3.5 flex-none text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function summarise(g: {
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  lastAt: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`${g.total} ${pluralImports(g.total)}`);
  if (g.failed > 0) parts.push(`${g.failed} с ошибкой`);
  if (g.running > 0) parts.push(`${g.running} в работе`);
  if (g.queued > 0) parts.push(`${g.queued} в очереди`);
  if (g.lastAt) {
    parts.push(`последний ${dayjs(g.lastAt).format('D MMM HH:mm')}`);
  }
  return parts.join(' · ');
}

function pluralImports(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'импортов';
  if (mod10 === 1) return 'импорт';
  if (mod10 >= 2 && mod10 <= 4) return 'импорта';
  return 'импортов';
}

/* ----------------------------------------------------------------- */
/* Page                                                              */

export function IntegrationsListPage() {
  useDocumentTitle('Интеграции');
  const notify = useNotifications();
  const { user } = useAuth();
  const isAdmin = user?.global_role === 'admin';
  const { data, isPending, error, refetch } = useIntegrations({ limit: 100 });
  const items = data?.data ?? [];

  const createMut = useCreateIntegration();

  // Which kind the inline token dialog is currently editing. ``null`` →
  // dialog closed. Set from the dropdown click on eJudge / Manual.
  const [tokenDialogKind, setTokenDialogKind] = useState<IntegrationKind | null>(
    null,
  );

  // OAuth-redirect helper used by Y.Contest / Stepik / Google Sheets.
  // Server returns oauth_authorize_url when the provider is configured
  // (client_id+secret saved on /admin/integrations → Авторизация). If
  // it's null we surface a soft toast and bail — no half-baked
  // integration row is left behind.
  const startOAuthIntegration = (
    kind: IntegrationKind,
    displayName: string,
  ) => {
    createMut.mutate(
      { kind, display_name: displayName, settings: {} },
      {
        onSuccess: (res) => {
          if (res.oauth_authorize_url) {
            window.location.assign(res.oauth_authorize_url);
            return;
          }
          notify.info(
            'OAuth для этого провайдера не настроен. Попросите администратора заполнить ключи в «Интеграции → Авторизация».',
          );
          refetch();
        },
        onError: (p) => {
          notify.error(
            (p as unknown as Problem).title ||
              'Не удалось создать подключение',
          );
        },
      },
    );
  };

  // Header action — single primary "+ Подключить" button. All concrete
  // providers live behind a 5-item dropdown:
  //   • Y.Contest / Stepik / Google Sheets — OAuth, redirect to provider
  //   • eJudge / Manual ZIP — token-modal (inline TokenIntegrationDialog)
  // The previous "Через мастер настройки" 4-step wizard is gone.
  const connectAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="integrations-new-button">
          <Plus className="mr-2 h-4 w-4" />
          Подключить
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onClick={() => startOAuthIntegration('yandex_contest', 'Yandex.Contest')}
          disabled={createMut.isPending}
          data-testid="integrations-connect-yandex-contest"
        >
          <ProviderIcon kind="yandex_contest" className="mr-2 h-4 w-4" />
          Yandex.Contest
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => startOAuthIntegration('stepik', 'Stepik')}
          disabled={createMut.isPending}
          data-testid="integrations-connect-stepik"
        >
          <ProviderIcon kind="stepik" className="mr-2 h-4 w-4" />
          Stepik
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => startOAuthIntegration('google_sheets', 'Google Sheets')}
          disabled={createMut.isPending}
          data-testid="integrations-connect-google-sheets"
        >
          <ProviderIcon kind="google_sheets" className="mr-2 h-4 w-4" />
          Google Sheets
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTokenDialogKind('ejudge')}
          data-testid="integrations-connect-ejudge"
        >
          <ProviderIcon kind="ejudge" className="mr-2 h-4 w-4" />
          eJudge · по токену
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTokenDialogKind('manual')}
          data-testid="integrations-connect-manual"
        >
          <ProviderIcon kind="manual" className="mr-2 h-4 w-4" />
          Ручная загрузка (ZIP)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // The "Sources" tab is what teachers and admins both see; "Авторизация"
  // (the OAuth-providers directory) is admin-only.
  const sourcesPanel = (
    <>
      {error && <ProblemAlert problem={error as unknown as Problem} />}
      {isPending && !data ? (
        <SkeletonList rows={3} rowHeight={48} />
      ) : items.length === 0 ? (
        // Empty state intentionally has no action — the page header already
        // owns the single primary "+ Подключить" button.
        <EmptyState title="Интеграций пока нет" />
      ) : (
        <>
          <div
            className="flex flex-col divide-y divide-border/40"
            data-testid="integrations-list"
          >
            {chunkPairs(items).map((row, rowIdx) => (
              <div
                key={rowIdx}
                className="grid grid-cols-1 gap-x-8 gap-y-3 py-4 sm:grid-cols-2 first:pt-0 last:pb-0"
              >
                {row.map((it) => (
                  <IntegrationTile
                    key={it.id}
                    integration={it}
                    onChanged={() => refetch()}
                  />
                ))}
              </div>
            ))}
          </div>
          <ActivitySummary integrations={items} />
        </>
      )}
    </>
  );

  return (
    <Page width="regular">
      <PageHeader
        title={
          <span data-testid="integrations-title">
            {isAdmin ? 'Интеграции' : 'Интеграции курса'}
          </span>
        }
        action={connectAction}
      />

      {isAdmin ? (
        <Tabs defaultValue="sources">
          <TabsList>
            <TabsTrigger value="sources" data-testid="integrations-tab-sources">
              Источники
            </TabsTrigger>
            <TabsTrigger value="auth" data-testid="integrations-tab-auth">
              Авторизация
            </TabsTrigger>
          </TabsList>
          <TabsContent value="sources" className="pt-6">
            {sourcesPanel}
          </TabsContent>
          <TabsContent value="auth" className="pt-6">
            <OAuthProvidersPanel />
          </TabsContent>
        </Tabs>
      ) : (
        sourcesPanel
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
/* OAuth providers tab — read-only directory of login providers.    */

function OAuthProvidersPanel() {
  const { data, isLoading, error } = useOAuthProviders();
  const notify = useNotifications();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<OAuthProviderInfo | null>(null);

  const onCopy = async (p: OAuthProviderInfo) => {
    try {
      await navigator.clipboard.writeText(p.redirect_uri);
      setCopiedId(p.provider);
      notify.success('Redirect URI скопирован');
      setTimeout(() => setCopiedId((cur) => (cur === p.provider ? null : cur)), 1500);
    } catch {
      notify.error('Не удалось скопировать');
    }
  };

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

  const providers = data ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Через эти провайдеры пользователи могут входить в платформу одной
        кнопкой. На странице входа отображаются только настроенные.
      </p>

      <div className="divide-y divide-border/50 border-y border-border/50">
        {providers.map((p) => (
          <div
            key={p.provider}
            className="grid grid-cols-[1fr_auto] items-center gap-4 py-4"
            data-testid={`oauth-provider-${p.provider}`}
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                {p.enabled ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/60" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {p.title}
                </span>
                <span
                  className={cn(
                    'text-xs',
                    p.enabled
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-muted-foreground/70',
                  )}
                >
                  {p.enabled ? 'настроено' : 'не настроено'}
                </span>
                {p.source === 'override' && (
                  <span
                    className="text-xs text-muted-foreground"
                    title="Значение задано через админ-UI, перекрывает env"
                  >
                    · из БД
                  </span>
                )}
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <span className="text-muted-foreground">client_id</span>
                <span className="font-mono text-foreground/80">
                  {p.client_id_preview || '—'}
                </span>
                <span className="text-muted-foreground">redirect_uri</span>
                <span className="font-mono text-foreground/80 truncate">
                  {p.redirect_uri}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onCopy(p)}
                aria-label="Скопировать redirect URI"
                title="Скопировать redirect URI"
                data-testid={`oauth-provider-copy-${p.provider}`}
              >
                {copiedId === p.provider ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              {p.docs_url && (
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  aria-label="Открыть консоль провайдера"
                  title="Консоль провайдера"
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
                data-testid={`oauth-provider-edit-${p.provider}`}
              >
                Изменить
              </Button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Изменения, сохранённые здесь, перекрывают переменные{' '}
        <code className="font-mono">GOOGLE_CLIENT_ID</code> /{' '}
        <code className="font-mono">..._CLIENT_SECRET</code> из{' '}
        <code className="font-mono">infra/.env</code> и применяются сразу — без перезапуска identity.
      </p>

      <OAuthProviderEditDialog
        provider={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

interface EditDialogProps {
  provider: OAuthProviderInfo | null;
  onClose: () => void;
}

function OAuthProviderEditDialog({ provider, onClose }: EditDialogProps) {
  const notify = useNotifications();
  const update = useUpdateOAuthProvider();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');

  // Reset form fields when a different provider is opened.
  const open = !!provider;
  // useState's lazy init isn't enough — we need to reset every open.
  // A tiny effect-equivalent: track the current provider in a ref.
  const lastProvider = useRef<string | null>(null);
  useEffect(() => {
    if (provider && lastProvider.current !== provider.provider) {
      lastProvider.current = provider.provider;
      // Pre-fill client_id only if there's already an override (the field is
      // an opaque preview otherwise — we never round-trip it).
      setClientId(provider.source === 'override' ? '' : '');
      setClientSecret('');
    }
    if (!provider) lastProvider.current = null;
  }, [provider]);

  if (!provider) return null;

  const onSave = async () => {
    try {
      await update.mutateAsync({
        provider: provider.provider,
        payload: {
          client_id: clientId.trim() || null,
          client_secret: clientSecret.trim() || null,
        },
      });
      notify.success(`${provider.title}: ключи обновлены`);
      onClose();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось сохранить');
    }
  };

  const onClear = async () => {
    if (!confirm(`Сбросить override и вернуться к env для ${provider.title}?`)) {
      return;
    }
    try {
      await update.mutateAsync({
        provider: provider.provider,
        payload: { client_id: '', client_secret: '' },
      });
      notify.success(`${provider.title}: возврат к env`);
      onClose();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось сбросить');
    }
  };

  // Telegram uses @BotFather, not OAuth2 — surface the field names the
  // admin actually sees in BotFather so they don't have to translate
  // "client_id → bot_username" in their head.
  const isTelegram = provider.provider === 'telegram';
  const idLabel = isTelegram ? 'bot username' : 'client_id';
  const secretLabel = isTelegram ? 'bot token' : 'client_secret';
  const idHint = isTelegram
    ? 'Имя бота из @BotFather, например @plaglens_login_bot'
    : null;
  const secretHint = isTelegram
    ? 'Длинная строка вида 123456:ABC-DEF... из @BotFather'
    : null;
  const setupHint = isTelegram ? (
    <span>
      Не забудьте выполнить <code className="font-mono">/setdomain</code> в
      @BotFather и указать хост этого стенда — иначе Telegram не пустит
      виджет на страницу входа.
    </span>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{provider.title}</DialogTitle>
          <DialogDescription>
            {isTelegram
              ? 'Введите данные бота из @BotFather. Поля, оставленные пустыми, не изменятся.'
              : 'Введите новые client_id и client_secret. Поля, оставленные пустыми, не изменятся.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="oauth-edit-client-id">{idLabel}</Label>
            <Input
              id="oauth-edit-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.currentTarget.value)}
              placeholder={provider.client_id_preview || 'не задан'}
              autoComplete="off"
              data-testid="oauth-edit-client-id"
            />
            {idHint && (
              <p className="text-xs text-muted-foreground">{idHint}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oauth-edit-client-secret">{secretLabel}</Label>
            <Input
              id="oauth-edit-client-secret"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.currentTarget.value)}
              type="password"
              placeholder={provider.has_secret ? '••••••••' : 'не задан'}
              autoComplete="new-password"
              data-testid="oauth-edit-client-secret"
            />
            {secretHint && (
              <p className="text-xs text-muted-foreground">{secretHint}</p>
            )}
          </div>
          <div className="space-y-1 pt-1">
            <Label className="text-muted-foreground">redirect_uri</Label>
            <code className="block break-all font-mono text-xs text-muted-foreground">
              {provider.redirect_uri}
            </code>
            {setupHint && (
              <p className="text-xs text-muted-foreground">{setupHint}</p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          {provider.source === 'override' && (
            <Button
              variant="ghost"
              onClick={onClear}
              disabled={update.isPending}
              className="text-destructive hover:text-destructive sm:mr-auto"
            >
              Сбросить к env
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Отмена
          </Button>
          <Button
            onClick={onSave}
            disabled={update.isPending || (!clientId.trim() && !clientSecret.trim())}
            data-testid="oauth-edit-save"
          >
            {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default IntegrationsListPage;
