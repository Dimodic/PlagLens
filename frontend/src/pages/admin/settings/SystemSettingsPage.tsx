/**
 * /admin/system/settings — platform / system info.
 *
 * Three flat blocks separated by hairlines (no boxes):
 *   1. Платформа    — build / version / environment / deployed / uptime.
 *   2. Сервисы      — live status of the seven domain services.
 *   3. Наблюдаемость — quick links into the metrics/traces stack.
 */
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useServicesStatus, useSystemVersion } from '@/hooks/api/useSystem';
import type { ServiceStatus } from '@/api/endpoints/system';
import type { Problem } from '@/api/types';
import { cn } from '@/components/ui/utils';

function formatUptime(seconds: number | undefined | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  // Compact, only show meaningful parts. "5d 3h 12m" / "3h 12m" / "12m" / "<1m".
  if (d > 0) return `${d}д ${h}ч ${m}м`;
  if (h > 0) return `${h}ч ${m}м`;
  if (m > 0) return `${m}м`;
  return '<1м';
}

function nonEmpty(v: string | undefined | null): string | null {
  if (!v) return null;
  const trimmed = String(v).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ServiceRow({ s }: { s: ServiceStatus }) {
  const tone =
    s.status === 'healthy'
      ? { ic: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' }
      : s.status === 'degraded'
        ? { ic: AlertCircle, cls: 'text-amber-600 dark:text-amber-400' }
        : { ic: XCircle, cls: 'text-red-600 dark:text-red-400' };
  const Ic = tone.ic;
  const latency =
    s.latency_ms != null && Number.isFinite(s.latency_ms)
      ? `${Math.round(s.latency_ms)} мс`
      : '—';
  return (
    <div
      className="grid grid-cols-[1fr_auto_auto] items-center gap-6 py-3 text-sm"
      data-testid={`system-service-${s.name}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Ic className={cn('h-4 w-4 shrink-0', tone.cls)} />
        <span className="truncate font-mono text-foreground">{s.name}</span>
        {nonEmpty(s.version) && (
          <span className="truncate text-xs text-muted-foreground">
            v{s.version}
          </span>
        )}
      </div>
      <span className="tabular-nums text-muted-foreground">{latency}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {dayjs(s.last_checked_at).format('HH:mm:ss')}
      </span>
    </div>
  );
}

export function SystemSettingsPage() {
  useDocumentTitle('Система');
  const ver = useSystemVersion();
  const svc = useServicesStatus();

  const data = ver.data;
  const rows: { k: string; v: React.ReactNode }[] = data
    ? [
        nonEmpty(data.app_name) && {
          k: 'Приложение',
          v: <span className="font-mono">{nonEmpty(data.app_name)}</span>,
        },
        nonEmpty(data.version) && {
          k: 'Версия',
          v: <span className="font-mono">{data.version}</span>,
        },
        nonEmpty(data.build) && {
          k: 'Build',
          v: <span className="font-mono">{data.build}</span>,
        },
        nonEmpty(data.environment) && {
          k: 'Окружение',
          v: <span className="font-mono">{data.environment}</span>,
        },
        data.deployed_at && {
          k: 'Развёрнуто',
          v: dayjs(data.deployed_at).format('DD.MM.YYYY HH:mm'),
        },
        {
          k: 'Uptime',
          v: <span className="tabular-nums">{formatUptime(data.uptime_seconds)}</span>,
        },
      ].filter(Boolean) as { k: string; v: React.ReactNode }[]
    : [];

  const services = svc.data?.services ?? [];
  const healthyCount = services.filter((s) => s.status === 'healthy').length;

  return (
    <Page width="narrow">
      <PageHeader title="Система" />

      {ver.error && <ProblemAlert problem={ver.error as unknown as Problem} />}

      {/* ===== Платформа ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Платформа
        </h2>
        {ver.isLoading ? (
          <div className="flex items-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет данных.</p>
        ) : (
          <div className="divide-y divide-border/50 border-y border-border/50">
            {rows.map((it) => (
              <div
                key={it.k}
                className="grid grid-cols-[1fr_auto] items-center gap-4 py-2.5 text-sm"
              >
                <span className="text-muted-foreground">{it.k}</span>
                <span className="font-medium text-foreground">{it.v}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ===== Сервисы ===== */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Сервисы
          </h2>
          {services.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {healthyCount} / {services.length} живы
            </span>
          )}
        </div>
        {svc.isLoading ? (
          <div className="flex items-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Шлюз не вернул список сервисов.
          </p>
        ) : (
          <div className="divide-y divide-border/50 border-y border-border/50">
            {services.map((s) => (
              <ServiceRow key={s.name} s={s} />
            ))}
          </div>
        )}
        <div className="pt-1">
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/admin/system/health">
              Подробные проверки
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ===== Наблюдаемость ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Наблюдаемость
        </h2>
        <div className="divide-y divide-border/50 border-y border-border/50">
          {[
            { label: 'Grafana — дашборды', href: '/grafana/' },
            { label: 'Prometheus — метрики', href: '/prometheus/' },
            { label: 'Jaeger — распределённые трассы', href: '/jaeger/' },
          ].map((it) => (
            <a
              key={it.href}
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group grid grid-cols-[1fr_auto] items-center gap-4 py-2.5 text-sm transition-colors hover:bg-muted/30"
            >
              <span className="text-foreground">{it.label}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Доступ к этим панелям ограничен внутренней сетью / VPN.
        </p>
      </section>
    </Page>
  );
}

export default SystemSettingsPage;
