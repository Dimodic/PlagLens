/**
 * /admin/system/settings — platform/system info (version, build, uptime,
 * health). Per-institution settings live on the institution detail page
 * (/admin/tenants/:id → Настройки), so this page is purely about the running
 * platform, not any single institution.
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSystemVersion } from '@/hooks/api/useSystem';
import type { Problem } from '@/api/types';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export function SystemSettingsPage() {
  useDocumentTitle('Система');
  const { data, isLoading, error } = useSystemVersion();

  const rows: { k: string; v: React.ReactNode }[] = data
    ? [
        { k: 'Приложение', v: <span className="font-mono">{data.app_name}</span> },
        { k: 'Версия', v: <span className="font-mono">{data.version}</span> },
        { k: 'Build', v: <span className="font-mono">{data.build}</span> },
        { k: 'Развёрнуто', v: dayjs(data.deployed_at).format('DD.MM.YYYY HH:mm') },
        { k: 'Uptime', v: formatUptime(data.uptime_seconds) },
        ...(data.environment
          ? [{ k: 'Окружение', v: data.environment as React.ReactNode }]
          : []),
      ]
    : [];

  return (
    <Page width="narrow">
      <PageHeader title="Система" />

      <div className="space-y-6">
        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y border-y">
            {rows.map((it) => (
              <div
                key={it.k}
                className="grid grid-cols-[1fr_auto] items-center gap-4 py-3 text-sm"
              >
                <span className="text-muted-foreground">{it.k}</span>
                <span className="font-medium text-foreground">{it.v}</span>
              </div>
            ))}
          </div>
        )}

        <Button asChild variant="outline">
          <Link to="/admin/system/health">
            Проверки здоровья сервисов
            <ArrowRight className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Page>
  );
}

export default SystemSettingsPage;
