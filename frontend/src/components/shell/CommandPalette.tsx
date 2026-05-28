/**
 * ⌘K command palette.
 *
 * Two modes:
 *   1. Empty query → "Quick actions" — role-aware shortcuts to the
 *      common landing pages (Dashboard / My courses / Profile / etc).
 *      Beats showing a sad "type at least 2 characters" stub.
 *   2. Query ≥ 2 chars → federated search via GET /api/v1/search;
 *      groups (Courses / Assignments / People) come back from the
 *      gateway and we render them with hairline-separated items.
 *
 * RBAC quirks worth remembering:
 *   - `_search_users` on the gateway short-circuits for non-admins, so
 *     students will never see a People group. That's fine; the empty
 *     state explains it.
 *   - Students with zero courses get an empty Courses group too. The
 *     'no results' fallback nudges them toward Профиль → Код приглашения.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Building2,
  FileText,
  Home,
  Search as SearchIcon,
  Settings as SettingsIcon,
  User as UserIcon,
  Users,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useTranslation } from '@/i18n';
import { useAuth } from '@/auth/useAuth';
import { useGlobalSearch } from '@/hooks/api/useSearch';
import type { SearchGroup, SearchType } from '@/api/endpoints/search';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_ORDER: SearchType[] = ['course', 'assignment', 'user'];

function typeIcon(type: SearchType) {
  if (type === 'course') return <BookOpen className="h-4 w-4 text-muted-foreground" />;
  if (type === 'assignment') return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <UserIcon className="h-4 w-4 text-muted-foreground" />;
}

function typeLabel(type: SearchType, t: (k: string) => string): string {
  const k =
    type === 'course' ? 'cmdk.group.courses'
    : type === 'assignment' ? 'cmdk.group.assignments'
    : 'cmdk.group.users';
  return t(k);
}

function buildHref(type: SearchType, id: string, slug?: string): string {
  if (type === 'course') return slug ? `/courses/${slug}` : `/courses/${id}`;
  if (type === 'assignment') return `/assignments/${id}`;
  return `/admin/users/${id}`;
}

interface QuickAction {
  id: string;
  labelKey: string;
  to: string;
  icon: JSX.Element;
}

function quickActionsForRole(role: string | undefined): QuickAction[] {
  const base: QuickAction[] = [
    { id: 'home', labelKey: 'cmdk.quick.dashboard', to: '/', icon: <Home className="h-4 w-4 text-muted-foreground" /> },
    { id: 'courses', labelKey: 'cmdk.quick.courses', to: '/me/assignments', icon: <BookOpen className="h-4 w-4 text-muted-foreground" /> },
    { id: 'profile', labelKey: 'cmdk.quick.profile', to: '/me/profile', icon: <UserIcon className="h-4 w-4 text-muted-foreground" /> },
    { id: 'notifications', labelKey: 'cmdk.quick.notifications', to: '/notifications', icon: <Bell className="h-4 w-4 text-muted-foreground" /> },
  ];
  if (role === 'teacher' || role === 'admin') {
    base.push({
      id: 'integrations',
      labelKey: 'cmdk.quick.integrations',
      to: '/integrations',
      icon: <SettingsIcon className="h-4 w-4 text-muted-foreground" />,
    });
  }
  if (role === 'admin') {
    base.push(
      {
        id: 'admin-users',
        labelKey: 'cmdk.quick.admin_users',
        to: '/admin/users',
        icon: <Users className="h-4 w-4 text-muted-foreground" />,
      },
      {
        id: 'admin-tenants',
        labelKey: 'cmdk.quick.admin_tenants',
        to: '/admin/tenants',
        icon: <Building2 className="h-4 w-4 text-muted-foreground" />,
      },
    );
  }
  return base;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const { data, isLoading } = useGlobalSearch(query, { enabled: open && hasQuery });

  const groups: SearchGroup[] = useMemo(() => {
    const list = (data?.groups ?? []) as SearchGroup[];
    return [...list]
      .filter((g) => g.items.length > 0)
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  }, [data]);

  const quick = useMemo(
    () => quickActionsForRole(user?.global_role),
    [user?.global_role],
  );

  const onPickResult = useCallback(
    (type: SearchType, id: string, slug?: string) => {
      navigate(buildHref(type, id, slug));
      onClose();
    },
    [navigate, onClose],
  );

  const onPickQuick = useCallback(
    (to: string) => {
      navigate(to);
      onClose();
    },
    [navigate, onClose],
  );

  return (
    <CommandDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <CommandInput
        placeholder={t('shell.search_placeholder')}
        value={query}
        onValueChange={setQuery}
        data-testid="cmdk-input"
      />
      <CommandList>
        {!hasQuery ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
              <SearchIcon className="h-3.5 w-3.5" />
              {t('cmdk.hint')}
            </div>
            <CommandSeparator />
            <CommandGroup heading={t('cmdk.group.quick')}>
              {quick.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`quick-${a.id} ${t(a.labelKey)}`}
                  onSelect={() => onPickQuick(a.to)}
                  className="gap-3"
                  data-testid={`cmdk-quick-${a.id}`}
                >
                  {a.icon}
                  <span className="flex-1 truncate text-sm">{t(a.labelKey)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('cmdk.loading')}
          </div>
        ) : groups.length === 0 ? (
          <CommandEmpty>{t('cmdk.no_results')}</CommandEmpty>
        ) : (
          groups.map((g) => (
            <CommandGroup key={g.type} heading={typeLabel(g.type, t)}>
              {g.items.map((r) => {
                const subtitle = r.email ?? r.slug ?? '';
                return (
                  <CommandItem
                    key={`${g.type}-${r.id}`}
                    value={`${r.title} ${subtitle}`}
                    onSelect={() => onPickResult(g.type, r.id, r.slug)}
                    className="gap-3"
                  >
                    {typeIcon(g.type)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.title}</div>
                      {subtitle && (
                        <div className="truncate text-xs text-muted-foreground">
                          {subtitle}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))
        )}
      </CommandList>
    </CommandDialog>
  );
}
