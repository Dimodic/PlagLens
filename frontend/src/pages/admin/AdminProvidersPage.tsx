/**
 * Admin "Провайдеры" — combined view of all integration providers
 * (LLM, Plagiarism, Email, OAuth) with health + quick links.
 */
import { Link } from 'react-router-dom';
import { StatusPill, type StatusTone } from '@/components/common/StatusPill';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useProviders as useLLMProviders } from '@/hooks/api/useAi';
import { useEmailConfig } from '@/hooks/api/useNotificationsAdmin';
import { useTelegramConfig } from '@/hooks/api/useIntegrations';

interface ProviderTileProps {
  name: string;
  category: string;
  status: 'enabled' | 'disabled' | 'unknown';
  detail?: string;
  to: string;
  testid?: string;
}

function statusBadge(status: ProviderTileProps['status']) {
  const tone: StatusTone =
    status === 'enabled' ? 'success' : status === 'disabled' ? 'neutral' : 'neutral';
  const label = status === 'unknown' ? 'не настроено' : status;
  return <StatusPill tone={tone}>{label}</StatusPill>;
}

function ProviderTile({
  name,
  category,
  status,
  detail,
  to,
  testid,
}: ProviderTileProps) {
  return (
    <Link to={to} data-testid={testid} className="group block">
      <Card className="h-full border-border/70 transition-colors hover:bg-muted/40">
        <CardContent className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {category}
            </span>
            <span className="ml-auto">{statusBadge(status)}</span>
          </div>
          <div className="text-base font-medium text-foreground">{name}</div>
          {detail && (
            <div className="text-xs text-muted-foreground">{detail}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function AdminProvidersPage() {
  useDocumentTitle('Провайдеры');
  const llmQ = useLLMProviders();
  const llms: any[] = (llmQ.data as any) ?? [];
  const llmActive: any =
    llms.find((p: any) => p.default_for_tenant) ?? llms[0];
  const emailQ = useEmailConfig();
  const tgQ = useTelegramConfig();

  // Email transport is enabled when the admin endpoint returns a config with
  // from_email + dns_validated. 404 / network errors degrade to "unknown" so we
  // never falsely advertise a working transport. The frontend type omits
  // `dns_validated` (backend EmailConfigOut adds it), so we read via raw object.
  const emailRaw: any = emailQ.data;
  const emailStatus: 'enabled' | 'disabled' | 'unknown' = emailQ.isLoading
    ? 'unknown'
    : emailQ.error
      ? 'unknown'
      : emailRaw && emailRaw.from_email
        ? emailRaw.dns_validated === false
          ? 'disabled'
          : 'enabled'
        : 'unknown';

  // Telegram transport — TelegramBotSettings.is_active in the typed contract;
  // the running backend currently returns {token_configured} so we accept either
  // shape and prefer is_active when present.
  const tgRaw: any = tgQ.data;
  const tgStatus: 'enabled' | 'disabled' | 'unknown' = tgQ.isLoading
    ? 'unknown'
    : tgQ.error
      ? 'unknown'
      : tgRaw
        ? tgRaw.is_active === true ||
          tgRaw.has_token === true ||
          tgRaw.token_configured === true
          ? 'enabled'
          : 'disabled'
        : 'unknown';

  return (
    <Page width="regular">
      <PageHeader title="Провайдеры" />

      {/* LLM */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">LLM</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProviderTile
            name={llmActive?.name ?? 'OpenRouter'}
            category="OpenAI-совместимый"
            status={
              llmQ.isLoading
                ? 'unknown'
                : llmActive?.enabled
                  ? 'enabled'
                  : 'disabled'
            }
            detail={
              llmActive
                ? `${llmActive.base_url ?? '—'} · ${llmActive.model ?? '—'}`
                : undefined
            }
            to="/admin/ai/providers"
            testid="provider-tile-llm"
          />
          <ProviderTile
            name="Бюджеты"
            category="LLM"
            status={llms.length > 0 ? 'enabled' : 'unknown'}
            to="/admin/ai/budgets"
            testid="provider-tile-budgets"
          />
          <ProviderTile
            name="Версии промптов"
            category="LLM"
            status="enabled"
            to="/admin/ai/prompt-versions"
            testid="provider-tile-prompts"
          />
        </div>
      </section>

      {/* Plagiarism */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Антиплагиат</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProviderTile
            name="Dolos"
            category="Provider"
            status="enabled"
            to="/admin/plagiarism-corpus"
            testid="provider-tile-dolos"
          />
        </div>
      </section>

      {/* Notifications */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">Почта и уведомления</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ProviderTile
            name={
              emailRaw?.transport === 'mailgun'
                ? 'Mailgun'
                : emailRaw?.transport === 'smtp'
                  ? 'SMTP'
                  : emailRaw?.provider
                    ? String(emailRaw.provider).toUpperCase()
                    : 'SMTP / Mailgun'
            }
            category="E-mail"
            status={emailStatus}
            detail={
              emailRaw?.from_email
                ? `${emailRaw.from_email}${
                    emailRaw.dns_validated === false ? ' · DNS не валидирован' : ''
                  }`
                : undefined
            }
            to="/admin/notifications/email"
            testid="provider-tile-email"
          />
          <ProviderTile
            name={
              (tgQ.data as any)?.bot_username
                ? `@${(tgQ.data as any).bot_username}`
                : (tgQ.data as any)?.username
                  ? `@${(tgQ.data as any).username}`
                  : 'Telegram bot'
            }
            category="Push"
            status={tgStatus}
            to="/admin/notifications/templates"
            testid="provider-tile-telegram"
          />
        </div>
      </section>

      {/* OAuth */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">OAuth</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* TODO(identity): wire OAuth provider status from a real endpoint.
              Identity service has /auth/oauth/{provider}/authorize but no
              admin-listing of which providers have client_id/secret configured.
              Until then we surface "не настроено" so admins are not misled. */}
          {(['Google', 'Yandex', 'Stepik', 'GitHub'] as const).map((p) => (
            <ProviderTile
              key={p}
              name={p}
              category="Identity"
              status="unknown"
              to="/admin/integrations"
              testid={`provider-tile-${p.toLowerCase()}`}
            />
          ))}
        </div>
      </section>
    </Page>
  );
}
