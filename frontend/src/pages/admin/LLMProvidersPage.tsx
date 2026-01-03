/**
 * /admin/ai/providers and /llm — LLM provider configuration.
 *
 * Restyled to mirror ScreenLLM in PlagLens-design-src: a quiet section header
 * with a "selected provider" summary line, then a flat list of provider rows
 * with a radio dot, name, and inline metadata.
 */
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Loader2, Sparkles } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { SkeletonList } from '@/components/common/Skeleton';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/auth/useAuth';
import {
  useCreateProvider,
  useProviders,
  useSetProviderDefault,
  useTenantUsage,
  useTestProvider,
  useUpdateProvider,
} from '@/hooks/api/useAi';
import type { ProviderConfig } from '@/api/endpoints/ai';
import type { Problem } from '@/api/types';

interface ProviderModalProps {
  mode: 'create' | 'edit';
  provider: ProviderConfig | null;
  opened: boolean;
  onClose: () => void;
}

/** Create + edit live in one dialog. In create mode the `provider` field is
 * editable (e.g. "openai", "openrouter", "anthropic"); in edit mode it is
 * fixed and shown in the dialog title. */
function ProviderModal({ mode, provider, opened, onClose }: ProviderModalProps) {
  const notify = useNotifications();
  const update = useUpdateProvider();
  const create = useCreateProvider();
  const [providerName, setProviderName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keyEnv, setKeyEnv] = useState('');
  const [priority, setPriority] = useState<number>(100);
  const [rpm, setRpm] = useState<number>(60);

  useEffect(() => {
    if (!opened) return;
    setApiKey(''); // never preload — key is write-only
    if (mode === 'edit' && provider) {
      setProviderName(provider.provider);
      setBaseUrl(provider.base_url);
      setModel(provider.model);
      setKeyEnv(provider.api_key_env_var);
      setPriority(provider.priority);
      setRpm(provider.rate_limit_rpm);
    } else {
      setProviderName('');
      setBaseUrl('');
      setModel('');
      setKeyEnv('');
      setPriority(100);
      setRpm(60);
    }
  }, [opened, mode, provider]);

  const isCreate = mode === 'create';
  const pending = isCreate ? create.isPending : update.isPending;
  const canSave =
    !pending &&
    (!isCreate || providerName.trim().length > 0) &&
    baseUrl.trim().length > 0 &&
    model.trim().length > 0;

  const handleSave = async () => {
    try {
      if (isCreate) {
        await create.mutateAsync({
          provider: providerName.trim(),
          base_url: baseUrl.trim(),
          model: model.trim(),
          api_key: apiKey.trim() || null,
          api_key_env_var: keyEnv.trim() || null,
          priority,
          rate_limit_rpm: rpm,
        } as Parameters<typeof create.mutateAsync>[0]);
        notify.success('Провайдер добавлен');
      } else if (provider) {
        await update.mutateAsync({
          id: provider.id,
          body: {
            base_url: baseUrl,
            model,
            // Send api_key only when user typed a new one; otherwise leave
            // the existing secret_ref untouched.
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
            api_key_env_var: keyEnv,
            priority,
            rate_limit_rpm: rpm,
          },
        });
        notify.success('Сохранено');
      }
      onClose();
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось сохранить');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent data-testid={isCreate ? 'provider-create-modal' : 'provider-edit-modal'}>
        <DialogHeader>
          <DialogTitle>
            {isCreate ? 'Новый провайдер' : `Edit: ${provider?.provider ?? ''}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {isCreate && (
            <div className="space-y-1.5">
              <Label htmlFor="provider-name">provider</Label>
              <Input
                id="provider-name"
                value={providerName}
                onChange={(e) => setProviderName(e.currentTarget.value)}
                placeholder="openai, openrouter, anthropic…"
                data-testid="provider-create-name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="provider-base-url">base_url</Label>
            <Input
              id="provider-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.currentTarget.value)}
              placeholder="https://api.openai.com/v1"
              data-testid="provider-edit-base-url"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-model">model</Label>
            <Input
              id="provider-model"
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              placeholder="gpt-4o-mini"
              data-testid="provider-edit-model"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-api-key">api_key</Label>
            <Input
              id="provider-api-key"
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.currentTarget.value)}
              placeholder={
                isCreate ? 'sk-or-v1-…' : '••••••••  (оставьте пустым, чтобы не менять)'
              }
              data-testid="provider-edit-api-key"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-api-key-env">
              или api_key env-var (имя переменной окружения)
            </Label>
            <Input
              id="provider-api-key-env"
              value={keyEnv}
              onChange={(e) => setKeyEnv(e.currentTarget.value)}
              placeholder="OPENROUTER_API_KEY"
              data-testid="provider-edit-api-key-env"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="provider-priority">priority</Label>
              <Input
                id="provider-priority"
                type="number"
                min={0}
                value={priority}
                onChange={(e) => setPriority(Number(e.currentTarget.value) || 0)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider-rpm">rate_limit_rpm</Label>
              <Input
                id="provider-rpm"
                type="number"
                min={0}
                value={rpm}
                onChange={(e) => setRpm(Number(e.currentTarget.value) || 0)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} data-testid="provider-edit-cancel">
              Отмена
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave}
              data-testid={isCreate ? 'provider-create-save' : 'provider-edit-save'}
            >
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isCreate ? 'Добавить' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function LLMProvidersPage() {
  useDocumentTitle('LLM provider');
  const notify = useNotifications();
  const { user } = useAuth();
  const tenantId = user?.tenant?.id;
  const isAdmin =
    user?.global_role === 'admin' || user?.global_role === 'super_admin';
  const { data, isLoading, error } = useProviders();
  const usage = useTenantUsage(isAdmin ? tenantId : undefined);
  const update = useUpdateProvider();
  const test = useTestProvider();
  const setDefault = useSetProviderDefault();

  const [editing, setEditing] = useState<ProviderConfig | null>(null);
  const [creating, setCreating] = useState(false);

  const handleToggle = async (p: ProviderConfig, enabled: boolean) => {
    try {
      await update.mutateAsync({ id: p.id, body: { enabled } });
      notify.success(enabled ? 'Включено' : 'Отключено');
    } catch (e) {
      const pp = e as Problem;
      notify.error(pp?.detail ?? pp?.title ?? 'Не удалось');
    }
  };

  const handleSetDefault = async (p: ProviderConfig) => {
    try {
      await setDefault.mutateAsync(p.id);
      notify.success('Установлено по умолчанию');
    } catch (e) {
      const pp = e as Problem;
      notify.error(pp?.detail ?? pp?.title ?? 'Не удалось');
    }
  };

  const handleTest = async (p: ProviderConfig) => {
    try {
      const res = await test.mutateAsync(p.id);
      if (res.ok) {
        notify.success(
          typeof res.latency_ms === 'number' ? `OK · ${res.latency_ms} ms` : 'OK',
        );
      } else {
        notify.error(res.error ?? 'Тест упал');
      }
    } catch (e) {
      const pp = e as Problem;
      notify.error(pp?.detail ?? pp?.title ?? 'Не удалось');
    }
  };

  const providers = useMemo(() => data ?? [], [data]);
  const active = useMemo(
    () => providers.find((p) => p.default_for_tenant) ?? providers[0],
    [providers],
  );

  const usageData = usage.data;
  const usageHistory = useMemo(
    () =>
      (usageData?.history ?? []).map((h) => ({
        date: dayjs(h.period_start).format('DD.MM'),
        tokens: Number(h.total_tokens ?? 0),
        analyses: Number(h.analyses_count ?? 0),
      })),
    [usageData],
  );
  const usageTotal30d = Number(usageData?.current?.total_tokens ?? 0);
  const usageRequests30d = Number(usageData?.current?.analyses_count ?? 0);
  const hasUsage = usageData?.current != null && usageTotal30d > 0;

  return (
    <Page width="regular">
      <PageHeader
        title="LLM provider"
        action={
          isAdmin ? (
            <Button
              onClick={() => setCreating(true)}
              data-testid="provider-add-button"
            >
              Добавить провайдера
            </Button>
          ) : null
        }
      />

      {error && <ProblemAlert problem={error as unknown as Problem} />}

      {/* Active provider summary */}
      {active && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Активная модель</h2>
          <div className="grid grid-cols-2 gap-8 border-t py-5 md:grid-cols-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Модель
              </div>
              <div className="mt-1.5 text-base font-medium">{active.model}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{active.provider}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Приоритет
              </div>
              <div className="mt-1.5 text-base font-medium tabular-nums">{active.priority}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Лимит RPM
              </div>
              <div className="mt-1.5 text-base font-medium tabular-nums">
                {active.rate_limit_rpm}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Контекст
              </div>
              <div className="mt-1.5 text-base font-medium tabular-nums">
                {active.base_url.includes('openrouter')
                  ? '~128k'
                  : active.base_url.includes('anthropic')
                    ? '200k'
                    : '—'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Providers list */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Провайдеры</h2>
        {isLoading && providers.length === 0 ? (
          <SkeletonList rows={3} rowHeight={56} />
        ) : providers.length === 0 ? (
          <EmptyState
            title="Провайдеры не настроены"
            action={
              isAdmin ? (
                <Button
                  onClick={() => setCreating(true)}
                  data-testid="provider-add-button-empty"
                >
                  Добавить провайдера
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="divide-y border-y">
            {providers.map((p) => {
              const on = p.default_for_tenant;
              return (
                <div
                  key={p.id}
                  data-testid={`provider-row-${p.id}`}
                  className="flex items-center gap-5 px-3 py-4"
                >
                  <span
                    aria-hidden
                    className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-[1.5px] ${
                      on ? 'border-foreground' : 'border-border'
                    }`}
                  >
                    {on && <span className="h-1.5 w-1.5 rounded-full bg-foreground" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium tracking-tight">
                      {p.provider}
                      {on && (
                        <span className="ml-2 text-xs font-medium text-emerald-600">default</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground">
                      <span className="font-mono">{p.model}</span>{' '}
                      <span className="text-muted-foreground/70">· {p.base_url}</span>
                      <span> · priority </span>
                      <span className="tabular-nums">{p.priority}</span>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-medium ${
                      !p.enabled
                        ? 'text-muted-foreground'
                        : p.default_for_tenant
                          ? 'text-emerald-600'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {p.enabled ? 'enabled' : 'disabled'}
                  </span>
                  <Switch
                    checked={p.enabled}
                    onCheckedChange={(v) => handleToggle(p, v)}
                    aria-label="enabled"
                    data-testid={`provider-row-${p.id}-toggle`}
                  />
                  {!p.default_for_tenant && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetDefault(p)}
                      data-testid={`provider-row-${p.id}-set-default`}
                    >
                      Сделать дефолтом
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(p)}
                    data-testid={`provider-row-${p.id}-edit`}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTest(p)}
                    data-testid={`provider-row-${p.id}-test`}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Тест
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Token usage */}
      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">Расход токенов · 30 дней</h2>
          {usage.isLoading && !hasUsage ? (
            <SkeletonList rows={2} rowHeight={56} />
          ) : !hasUsage ? (
            <div data-testid="llm-usage-empty">
              <EmptyState
                title="Нет данных"
                action={
                  <Button variant="outline" onClick={() => usage.refetch()}>
                    Обновить
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <div
                data-testid="llm-usage-metrics"
                className="grid grid-cols-1 gap-8 border-t py-5 md:grid-cols-3"
              >
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Токенов
                  </div>
                  <div className="mt-1.5 text-2xl font-medium tracking-tight tabular-nums">
                    {usageTotal30d >= 1000
                      ? `${(usageTotal30d / 1000).toFixed(1)}k`
                      : usageTotal30d.toLocaleString('ru-RU')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Запросов
                  </div>
                  <div className="mt-1.5 text-2xl font-medium tracking-tight tabular-nums">
                    {usageRequests30d.toLocaleString('ru-RU')}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Cache hits
                  </div>
                  <div className="mt-1.5 text-2xl font-medium tracking-tight tabular-nums">
                    {(usageData?.current?.cache_hits ?? 0).toLocaleString('ru-RU')}
                  </div>
                </div>
              </div>
              {usageHistory.length > 0 ? (
                <div
                  data-testid="llm-usage-chart"
                  className="h-52 w-full rounded-lg border p-3"
                >
                  <ResponsiveContainer>
                    <LineChart
                      data={usageHistory}
                      margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        width={48}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="tokens"
                        name="Токенов"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div data-testid="llm-usage-chart-empty">
                  <EmptyState title="Нет агрегатов" />
                </div>
              )}
            </>
          )}
        </section>
      )}

      <ProviderModal
        mode="edit"
        provider={editing}
        opened={editing != null}
        onClose={() => setEditing(null)}
      />
      <ProviderModal
        mode="create"
        provider={null}
        opened={creating}
        onClose={() => setCreating(false)}
      />
    </Page>
  );
}

export default LLMProvidersPage;
