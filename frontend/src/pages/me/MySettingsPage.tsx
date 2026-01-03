/**
 * Personal "Settings" — non-admin variant. Document-style page with quick
 * links to focused subpages (security, notifications, external bindings,
 * API keys).
 */
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/auth/useAuth';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Page, PageHeader, Section } from '@/components/layout/Page';

interface RowProps {
  to: string;
  title: string;
  testid?: string;
  isFirst?: boolean;
}

function NavRow({ to, title, testid, isFirst }: RowProps) {
  return (
    <Link
      to={to}
      data-testid={testid}
      className={`flex items-center gap-4 py-3 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-md ${
        !isFirst ? 'border-t border-border/50 mt-0 rounded-none' : ''
      }`}
    >
      <div className="min-w-0 flex-1 text-sm font-medium text-foreground">
        {title}
      </div>
      <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
    </Link>
  );
}

export default function MySettingsPage() {
  useDocumentTitle('Настройки');
  const { user } = useAuth();

  return (
    <Page width="narrow">
      <PageHeader title="Настройки" />

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
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {user.email} · {user.global_role ?? 'student'}
            </div>
          </div>
        </div>
      )}

      <Section title="Аккаунт" variant="document">
        <NavRow
          to="/me/profile"
          title="Профиль"
          testid="settings-link-profile"
          isFirst
        />
        <NavRow
          to="/me/security"
          title="Безопасность"
          testid="settings-link-security"
        />
        <NavRow
          to="/me/security?tab=2fa"
          title="Двухфакторная аутентификация"
          testid="settings-link-2fa"
        />
      </Section>

      <Section title="Уведомления" variant="document">
        <NavRow
          to="/me/notifications/preferences"
          title="Подписки и каналы"
          testid="settings-link-notifications"
          isFirst
        />
        <NavRow
          to="/me/notifications/web-push"
          title="Web-push в браузере"
          testid="settings-link-webpush"
        />
        <NavRow
          to="/notifications"
          title="История уведомлений"
          testid="settings-link-inbox"
        />
      </Section>

      <Section title="Подключения" variant="document">
        <NavRow
          to="/me/external-bindings"
          title="Внешние аккаунты"
          testid="settings-link-bindings"
          isFirst
        />
        <NavRow
          to="/me/api-keys"
          title="API-ключи"
          testid="settings-link-keys"
        />
      </Section>

      <Section title="Данные" variant="document">
        <NavRow
          to="/me/exports"
          title="Мои экспорты"
          testid="settings-link-exports"
          isFirst
        />
        <NavRow
          to="/me/grades"
          title="Мои оценки"
          testid="settings-link-grades"
        />
      </Section>
    </Page>
  );
}
