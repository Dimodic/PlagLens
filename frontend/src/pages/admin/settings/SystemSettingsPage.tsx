/**
 * /admin/system/settings — tenant-level settings overview.
 *
 * Editorial paper layout: sections delineated by thin lines, key-value pairs
 * for read-only display. Live values come from the existing `useSystemVersion`
 * hook with placeholders for future tenant-config fields.
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSystemVersion } from '@/hooks/api/useSystem';
import { useTenantSettings } from '@/hooks/api/useTenants';
import { useAuth } from '@/auth/useAuth';
import type { Problem } from '@/api/types';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

interface KvRow {
  k: string;
  v: React.ReactNode;
}

function KvList({ items }: { items: KvRow[] }) {
  return (
    <div className="divide-y border-y">
      {items.map((it, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] items-center gap-4 py-4 text-sm"
        >
          <span className="text-muted-foreground">{it.k}</span>
          <span className="font-medium text-foreground">{it.v}</span>
        </div>
      ))}
    </div>
  );
}

function fmt(value: unknown): React.ReactNode {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'включено' : 'выключено';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

interface SectionProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, actions, children }: SectionProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function SystemSettingsPage() {
  useDocumentTitle('Настройки учреждения');
  const { user } = useAuth();
  const { data, isLoading, error } = useSystemVersion();
  const tenantId = user?.tenant?.id;
  const { data: tenantSettings, isLoading: settingsLoading } = useTenantSettings(tenantId);
  const raw = (tenantSettings ?? {}) as Record<string, unknown>;
  const nested = (raw.settings as Record<string, unknown> | undefined) ?? {};
  const s: Record<string, unknown> = { ...raw, ...nested };

  return (
    <Page width="narrow">
      <PageHeader title="Настройки учреждения" />

      <div className="space-y-8">
        {error && <ProblemAlert problem={error as unknown as Problem} />}

        <Section title="Система">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : data ? (
            <KvList
              items={[
                { k: 'Приложение', v: <span className="font-mono">{data.app_name}</span> },
                { k: 'Версия', v: <span className="font-mono">{data.version}</span> },
                { k: 'Build', v: <span className="font-mono">{data.build}</span> },
                {
                  k: 'Развёрнуто',
                  v: dayjs(data.deployed_at).format('DD.MM.YYYY HH:mm'),
                },
                { k: 'Uptime', v: formatUptime(data.uptime_seconds) },
                ...(data.environment
                  ? [{ k: 'Environment', v: data.environment }]
                  : []),
              ]}
            />
          ) : null}
        </Section>

        <Section title="Аутентификация">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <KvList
              items={[
                { k: 'OAuth провайдеры', v: fmt(s.oauth_providers_enabled) },
                { k: 'MFA обязательна', v: fmt(s.mfa_required) },
                { k: 'Политика паролей', v: fmt(s.password_policy) },
              ]}
            />
          )}
        </Section>

        <Section title="Конфиденциальность">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <KvList
              items={[
                {
                  k: 'Срок хранения данных',
                  v: s.data_retention_days ? `${s.data_retention_days} дн.` : '—',
                },
                {
                  k: 'Срок хранения audit',
                  v: s.audit_retention_days ? `${s.audit_retention_days} дн.` : '—',
                },
                {
                  k: 'Сравнение между курсами',
                  v: fmt(s.cross_course_comparison),
                },
              ]}
            />
          )}
        </Section>

        <Section title="AI / LLM">
          {settingsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <KvList
              items={[
                { k: 'Провайдер по умолчанию', v: fmt(s.default_ai_provider) },
                { k: 'Модель по умолчанию', v: fmt(s.default_ai_model) },
                {
                  k: 'Дневной лимит запросов',
                  v: s.ai_daily_request_limit ? fmt(s.ai_daily_request_limit) : '—',
                },
              ]}
            />
          )}
        </Section>

        <Section
          title="Здоровье сервисов"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/system/health">
                Health checks
                <ArrowRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          }
        >
          <div className="py-2" />
        </Section>
      </div>
    </Page>
  );
}

export default SystemSettingsPage;
