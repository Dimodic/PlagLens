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
import { useTranslation, t } from '@/i18n';
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
  if (d > 0) return t('system_settings.uptime_dhm', { d, h, m });
  if (h > 0) return t('system_settings.uptime_hm', { h, m });
  if (m > 0) return t('system_settings.uptime_m', { m });
  return t('system_settings.uptime_lt_min');
}

function nonEmpty(v: string | undefined | null): string | null {
  if (!v) return null;
  const trimmed = String(v).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function ServiceRow({ s }: { s: ServiceStatus }) {
  const { t } = useTranslation();
  const tone =
    s.status === 'healthy'
      ? { ic: CheckCircle2, cls: 'text-emerald-600 dark:text-emerald-400' }
      : s.status === 'degraded'
        ? { ic: AlertCircle, cls: 'text-amber-600 dark:text-amber-400' }
        : { ic: XCircle, cls: 'text-red-600 dark:text-red-400' };
  const Ic = tone.ic;
  const latency =
    s.latency_ms != null && Number.isFinite(s.latency_ms)
      ? t('system_settings.latency_ms', { ms: Math.round(s.latency_ms) })
      : '—';
  return (
    <div
      className="grid grid-cols-[1fr_auto_auto] items-center gap-6 rounded-md px-2 py-3 text-sm transition-colors hover:bg-muted/30"
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
  const { t } = useTranslation();
  useDocumentTitle(t('system_settings.title'));
  const ver = useSystemVersion();
  const svc = useServicesStatus();

  const data = ver.data;
  const rows: { k: string; v: React.ReactNode }[] = data
    ? [
        nonEmpty(data.app_name) && {
          k: t('system_settings.app_name'),
          v: <span className="font-mono">{nonEmpty(data.app_name)}</span>,
        },
        nonEmpty(data.version) && {
          k: t('system_settings.version'),
          v: <span className="font-mono">{data.version}</span>,
        },
        nonEmpty(data.build) && {
          k: 'Build',
          v: <span className="font-mono">{data.build}</span>,
        },
        nonEmpty(data.environment) && {
          k: t('system_settings.environment'),
          v: <span className="font-mono">{data.environment}</span>,
        },
        data.deployed_at && {
          k: t('system_settings.deployed_at'),
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

  // Observability panels live on their own subdomains (grafana.<host>,
  // prometheus.<host>, jaeger.<host>) behind Traefik with HTTP basic-auth — so
  // only the admin (who has the password) can open them. The raw container
  // ports are bound to localhost. Build from the current hostname so it works
  // in dev (grafana.localhost) and prod alike.
  const obsHost =
    typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const observability = [
    { label: t('system_settings.grafana'), href: `https://grafana.${obsHost}/` },
    {
      label: t('system_settings.prometheus'),
      href: `https://prometheus.${obsHost}/`,
    },
    { label: t('system_settings.jaeger'), href: `https://jaeger.${obsHost}/` },
  ];

  return (
    <Page width="narrow">
      <PageHeader title={t('system_settings.title')} />

      {ver.error && <ProblemAlert problem={ver.error as unknown as Problem} />}

      {/* ===== Платформа ===== */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t('system_settings.platform')}
        </h2>
        {ver.isLoading ? (
          <div className="flex items-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('system_settings.no_data')}</p>
        ) : (
          <div>
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
      <section className="space-y-3 border-t border-border/50 pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t('system_settings.services')}
          </h2>
          {services.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t('system_settings.healthy_count', {
                healthy: healthyCount,
                total: services.length,
              })}
            </span>
          )}
        </div>
        {svc.isLoading ? (
          <div className="flex items-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('system_settings.services_empty')}
          </p>
        ) : (
          <div className="space-y-0.5">
            {services.map((s) => (
              <ServiceRow key={s.name} s={s} />
            ))}
          </div>
        )}
        <div className="pt-1">
          <Button asChild variant="link" className="h-auto p-0">
            <Link to="/admin/system/health">
              {t('system_settings.detailed_checks')}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* ===== Наблюдаемость ===== */}
      <section className="space-y-3 border-t border-border/50 pt-6">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {t('system_settings.observability')}
        </h2>
        <div className="space-y-0.5">
          {observability.map((it) => (
            <a
              key={it.href}
              href={it.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group grid grid-cols-[1fr_auto] items-center gap-4 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted/30"
            >
              <span className="text-foreground">{it.label}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('system_settings.observability_note')}
        </p>
      </section>
    </Page>
  );
}

export default SystemSettingsPage;
