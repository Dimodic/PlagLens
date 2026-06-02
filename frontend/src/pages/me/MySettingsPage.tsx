/**
 * Personal "Settings" — non-admin variant. Document-style page with quick
 * links to focused subpages (security, notifications, external bindings,
 * API keys).
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/auth/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Page, PageHeader, Section } from '@/components/layout/Page';
import { RoleBadge } from '@/components/common/RoleBadge';

interface RowProps {
  to: string;
  title: string;
  testid?: string;
  isFirst?: boolean;
}

function NavRow({ to, title, testid }: RowProps) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className="-mx-2 flex items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {title}
      </div>
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
    </Link>
  );
}

export default function MySettingsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('my_settings.title'));
  const { user } = useAuth();

  return (
    <Page width="narrow">
      <PageHeader title={t('my_settings.title')} />

      {user && (
        <div className="flex items-center gap-4 pb-2">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-accent text-accent-foreground">
              {(user.display_name ?? user.email).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {user.display_name ?? user.email}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{user.email}</span>
              <RoleBadge role={user.global_role ?? 'student'} />
            </div>
          </div>
        </div>
      )}

      <Section title={t('my_settings.section_account')} variant="document">
        <NavRow
          to="/me/profile"
          title={t('my_settings.profile')}
          testid="settings-link-profile"
          isFirst
        />
        <NavRow
          to="/me/security"
          title={t('my_settings.security')}
          testid="settings-link-security"
        />
        <NavRow
          to="/me/security?tab=2fa"
          title={t('my_settings.two_factor')}
          testid="settings-link-2fa"
        />
      </Section>

      <Section title={t('my_settings.section_notifications')} variant="document">
        <NavRow
          to="/me/notifications/preferences"
          title={t('my_settings.notifications_subscriptions')}
          testid="settings-link-notifications"
          isFirst
        />
        <NavRow
          to="/me/notifications/web-push"
          title={t('my_settings.notifications_web_push')}
          testid="settings-link-webpush"
        />
        <NavRow
          to="/notifications"
          title={t('my_settings.notifications_history')}
          testid="settings-link-inbox"
        />
      </Section>

      <Section title={t('my_settings.section_connections')} variant="document">
        <NavRow
          to="/me/external-bindings"
          title={t('my_settings.external_accounts')}
          testid="settings-link-bindings"
          isFirst
        />
        <NavRow
          to="/me/api-keys"
          title={t('my_settings.api_keys')}
          testid="settings-link-keys"
        />
      </Section>

      <Section title={t('my_settings.section_data')} variant="document">
        <NavRow
          to="/me/exports"
          title={t('my_settings.my_exports')}
          testid="settings-link-exports"
          isFirst
        />
        <NavRow
          to="/me/grades"
          title={t('my_settings.my_grades')}
          testid="settings-link-grades"
        />
      </Section>
    </Page>
  );
}
