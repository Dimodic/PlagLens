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
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { useQueries } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronRight,
  FileSpreadsheet,
  KeyRound,
  MoreHorizontal,
  PlayCircle,
  Plus,
  Power,
  RefreshCw,
  Sparkles,
  Trash2,
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
import { cn } from '@/components/ui/utils';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
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
  const navigate = useNavigate();
  const notify = useNotifications();
  const { user } = useAuth();
  const isAdmin =
    user?.global_role === 'admin' || user?.global_role === 'super_admin';
  const { data, isPending, error, refetch } = useIntegrations({ limit: 100 });
  const items = data?.data ?? [];

  const createMut = useCreateIntegration();
  const connectGoogle = () => {
    createMut.mutate(
      {
        kind: 'google_sheets',
        display_name: 'Google Sheets',
        settings: { auth_mode: 'oauth' },
      },
      {
        onSuccess: (res) => {
          if (res.oauth_authorize_url) {
            window.location.assign(res.oauth_authorize_url);
            return;
          }
          notify.error(
            'OAuth-клиент Google не настроен — обратитесь к админу',
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

  // Header action — single primary "+ Подключить" button. All quick
  // create-flows hidden in a dropdown so the header stays calm.
  const connectAction = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid="integrations-new-button">
          <Plus className="mr-2 h-4 w-4" />
          Подключить
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onClick={() => navigate('/integrations/wizard')}>
          <Sparkles className="mr-2 h-4 w-4" />
          Через мастер настройки
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {!isAdmin && (
          <DropdownMenuItem
            onClick={connectGoogle}
            disabled={createMut.isPending}
            data-testid="integrations-sheets-connect"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Google Sheets · войти через Google
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={() =>
            navigate(
              isAdmin
                ? '/integrations/google-sheets/setup'
                : '/integrations/google-sheets/personal-setup',
            )
          }
          data-testid={
            isAdmin
              ? 'integrations-sheets-setup'
              : 'integrations-sheets-personal'
          }
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Google Sheets · {isAdmin ? 'service account' : 'свой Service Account'}
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                navigate('/admin/integrations/oauth-providers')
              }
              data-testid="integrations-oauth-providers"
            >
              <KeyRound className="mr-2 h-4 w-4" />
              OAuth-провайдеры
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {isPending && !data ? (
        <SkeletonList rows={3} rowHeight={48} />
      ) : items.length === 0 ? (
        <EmptyState
          title="Интеграций нет"
          action={
            <Button onClick={() => navigate('/integrations/wizard')}>
              Подключить
            </Button>
          }
        />
      ) : (
        <>
          {/* Integrations — chunked into rows of 2 with thin horizontal
              dividers between each row. Pure 2-col grid (the previous
              approach) had no structural separation: tiles "floated"
              without delimitation, the user read it as "будто нет
              разделения". Drawing each row of the grid as its own flex
              container with `divide-y` on the outer gives the table-
              like rhythm without dragging in card chrome. */}
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

          {/* Cross-integration activity — one summary line per source,
              not a chronological wall of identical entries. */}
          <ActivitySummary integrations={items} />
        </>
      )}
    </Page>
  );
}

export default IntegrationsListPage;
