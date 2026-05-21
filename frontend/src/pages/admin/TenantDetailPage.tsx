/**
 * /admin/tenants/:id — institution detail. Tabs: Настройки, Пользователи,
 * Статистика, Аудит. Flat layout (no card chrome) per the minimalism principle.
 */
import { useEffect, useState, KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import { Page } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { TenantInvitationsPanel } from '@/components/admin/TenantInvitationsPanel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useActivateTenant,
  useSuspendTenant,
  useTenant,
  useTenantUsage,
  useUpdateTenantSettings,
} from '@/hooks/api/useTenants';
import type { Problem } from '@/api/types';

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-medium tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Учреждение');
  const notify = useNotifications();
  const tenantQ = useTenant(id);
  const usageQ = useTenantUsage(id);
  const update = useUpdateTenantSettings(id ?? '');
  const suspend = useSuspendTenant();
  const activate = useActivateTenant();

  const [corsOrigins, setCorsOrigins] = useState<string[]>([]);
  const [corsInput, setCorsInput] = useState('');
  const [defaultProvider, setDefaultProvider] = useState('');

  useEffect(() => {
    if (tenantQ.data) {
      setCorsOrigins(tenantQ.data.settings?.cors_origins ?? tenantQ.data.cors_origins ?? []);
      setDefaultProvider((tenantQ.data.settings?.default_ai_provider as string) ?? '');
    }
  }, [tenantQ.data]);

  const backLink = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
      <Link to="/admin/tenants">
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Учреждения
      </Link>
    </Button>
  );

  if (tenantQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (tenantQ.error) {
    return (
      <Page width="regular">
        {backLink}
        <ProblemAlert problem={tenantQ.error as unknown as Problem} />
      </Page>
    );
  }
  const tenant = tenantQ.data;
  if (!tenant) return null;

  const addCorsOrigin = () => {
    const v = corsInput.trim();
    if (v && !corsOrigins.includes(v)) setCorsOrigins([...corsOrigins, v]);
    setCorsInput('');
  };
  const removeCorsOrigin = (i: number) =>
    setCorsOrigins(corsOrigins.filter((_, idx) => idx !== i));
  const handleCorsKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCorsOrigin();
    }
  };

  const handleSaveSettings = async () => {
    try {
      await update.mutateAsync({
        cors_origins: corsOrigins,
        default_ai_provider: defaultProvider || null,
      });
      notify.success('Сохранено');
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };
  const handleSuspend = async () => {
    if (!id) return;
    try {
      await suspend.mutateAsync(id);
      notify.success('Учреждение приостановлено');
      tenantQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };
  const handleActivate = async () => {
    if (!id) return;
    try {
      await activate.mutateAsync(id);
      notify.success('Учреждение активировано');
      tenantQ.refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Page width="regular">
      {backLink}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            data-testid="tenant-detail-title"
            className="text-2xl font-semibold tracking-tight"
          >
            {tenant.name}
          </h1>
          <div className="mt-2" data-testid="tenant-status-badge">
            <StatusPill tone={tenant.status === 'active' ? 'success' : 'neutral'}>
              {tenant.status === 'active' ? 'активно' : tenant.status}
            </StatusPill>
          </div>
        </div>
        {tenant.status === 'active' ? (
          <Button
            variant="outline"
            disabled={suspend.isPending}
            onClick={handleSuspend}
            data-testid="tenant-suspend-button"
            className="text-amber-600 border-amber-600 hover:text-amber-600"
          >
            {suspend.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Приостановить
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={activate.isPending}
            onClick={handleActivate}
            data-testid="tenant-activate-button"
            className="text-emerald-600 border-emerald-600 hover:text-emerald-600"
          >
            {activate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Активировать
          </Button>
        )}
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings" data-testid="tenant-tab-settings">
            Настройки
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tenant-tab-users">
            Пользователи
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tenant-tab-usage">
            Статистика
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tenant-tab-audit">
            Аудит
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-5 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-id">ID</Label>
            <Input id="tenant-id" value={tenant.id} disabled />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-cors">Разрешённые CORS-домены</Label>
            <Input
              id="tenant-cors"
              value={corsInput}
              onChange={(e) => setCorsInput(e.currentTarget.value)}
              onKeyDown={handleCorsKey}
              onBlur={addCorsOrigin}
              placeholder="https://example.com (Enter)"
              data-testid="tenant-cors-input"
            />
            {corsOrigins.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {corsOrigins.map((origin, i) => (
                  <StatusPill key={i} tone="neutral">
                    {origin}
                    <button
                      type="button"
                      onClick={() => removeCorsOrigin(i)}
                      className="ml-1 hover:text-destructive"
                      aria-label={`Удалить ${origin}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </StatusPill>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tenant-provider">Провайдер ИИ по умолчанию</Label>
            <Input
              id="tenant-provider"
              value={defaultProvider}
              onChange={(e) => setDefaultProvider(e.currentTarget.value)}
              placeholder="openai"
              data-testid="tenant-default-provider-input"
            />
          </div>
          <div className="flex items-center justify-end">
            <Button
              onClick={handleSaveSettings}
              disabled={update.isPending}
              data-testid="tenant-save-button"
            >
              {update.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="users" className="space-y-6 pt-6">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Пользователи этого учреждения.
            </p>
            <Button asChild variant="outline">
              <Link to={`/admin/users?tenant_id=${tenant.id}`}>
                Открыть пользователей
              </Link>
            </Button>
          </div>
          <div className="border-t pt-6">
            <TenantInvitationsPanel tenantId={tenant.id} />
          </div>
        </TabsContent>

        <TabsContent value="usage" className="pt-6">
          {usageQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usageQ.data ? (
            <div className="grid grid-cols-2 gap-8 border-t py-6 md:grid-cols-4">
              <Metric label="Пользователей" value={usageQ.data.users ?? 0} />
              <Metric label="Активных сессий" value={usageQ.data.active_sessions ?? 0} />
              <Metric label="Курсов" value={usageQ.data.courses ?? 0} />
              <Metric label="Посылок · 30 дней" value={usageQ.data.submissions_30d ?? 0} />
              <Metric
                label="LLM-токенов · 30 дней"
                value={(usageQ.data.llm_tokens_30d ?? 0).toLocaleString('ru-RU')}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет данных</p>
          )}
        </TabsContent>

        <TabsContent value="audit" className="space-y-3 pt-6">
          <p className="text-sm text-muted-foreground">
            Журнал аудита этого учреждения.
          </p>
          <Button asChild variant="outline">
            <Link to={`/admin/audit?tenant_id=${tenant.id}`}>
              Открыть аудит учреждения
            </Link>
          </Button>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default TenantDetailPage;
