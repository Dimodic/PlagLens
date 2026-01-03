/**
 * /admin/tenants/:id — tabs: Settings, Users, Usage, Audit (proxy).
 */
import { useEffect, useState, KeyboardEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusPill } from '@/components/common/StatusPill';
import { Page } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
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

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  useDocumentTitle('Тенант');
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
      setDefaultProvider(
        (tenantQ.data.settings?.default_ai_provider as string) ?? '',
      );
    }
  }, [tenantQ.data]);

  if (tenantQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tenantQ.error) {
    return <ProblemAlert problem={tenantQ.error as unknown as Problem} />;
  }

  const tenant = tenantQ.data;
  if (!tenant) return null;

  const addCorsOrigin = () => {
    const v = corsInput.trim();
    if (v && !corsOrigins.includes(v)) {
      setCorsOrigins([...corsOrigins, v]);
    }
    setCorsInput('');
  };
  const removeCorsOrigin = (i: number) => {
    setCorsOrigins(corsOrigins.filter((_, idx) => idx !== i));
  };
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
      notify.success('Тенант приостановлен');
      tenantQ.refetch();
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  const handleActivate = async () => {
    if (!id) return;
    try {
      await activate.mutateAsync(id);
      notify.success('Тенант активирован');
      tenantQ.refetch();
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось');
    }
  };

  return (
    <Page width="regular">
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
              {tenant.status}
            </StatusPill>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings" data-testid="tenant-tab-settings">
            Settings
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tenant-tab-users">
            Users
          </TabsTrigger>
          <TabsTrigger value="usage" data-testid="tenant-tab-usage">
            Usage
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tenant-tab-audit">
            Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="pt-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="tenant-id">ID</Label>
                <Input id="tenant-id" value={tenant.id} disabled />
              </div>
              {/* Slug is internal / URL-only — not surfaced here. */}
              <div className="space-y-1.5">
                <Label htmlFor="tenant-cors">CORS origins</Label>
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
                <Label htmlFor="tenant-provider">default_ai_provider</Label>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="pt-4">
          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                Список пользователей этого тенанта.
              </p>
              <div>
                <Button asChild variant="outline">
                  <Link to={`/admin/users?tenant_id=${tenant.id}`}>
                    Открыть пользователей
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usage" className="pt-4">
          {usageQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : usageQ.data ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Пользователей</p>
                  <p className="font-semibold">{usageQ.data.users ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Активных сессий</p>
                  <p className="font-semibold">{usageQ.data.active_sessions ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Курсов</p>
                  <p className="font-semibold">{usageQ.data.courses ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Посылок (30д)</p>
                  <p className="font-semibold">{usageQ.data.submissions_30d ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">LLM-токенов (30д)</p>
                  <p className="font-semibold">
                    {(usageQ.data.llm_tokens_30d ?? 0).toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Нет данных</p>
          )}
        </TabsContent>

        <TabsContent value="audit" className="pt-4">
          <Card>
            <CardContent className="p-6">
              <Button asChild variant="outline">
                <Link to={`/admin/audit?tenant_id=${tenant.id}`}>Открыть аудит</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </Page>
  );
}

export default TenantDetailPage;
