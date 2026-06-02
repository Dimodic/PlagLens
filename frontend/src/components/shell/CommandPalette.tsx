/**
 * ⌘K command palette.
 *
 * Two modes:
 *   1. Empty query → "Quick actions" — role-aware shortcuts.
 *   2. Query ≥ 2 chars → federated search via GET /api/v1/search; groups
 *      (Люди / Посылки / Курсы / Задания) come back from the gateway and we
 *      render them hairline-separated. A pinned «Все результаты» item is
 *      first, so Enter opens the full results page (/search?q=…).
 *
 * Everyone (incl. students, cross-tenant) can search people and open the
 * public profile; submissions are pre-scoped server-side to the viewer's
 * courses.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Building2,
  FileCode2,
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
import { RoleBadge } from '@/components/common/RoleBadge';
import type { SearchGroup, SearchType } from '@/api/endpoints/search';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_ORDER: SearchType[] = ['person', 'submission', 'course', 'assignment'];

function typeIcon(type: SearchType) {
  if (type === 'course') return <BookOpen className="h-4 w-4 text-muted-foreground" />;
  if (type === 'assignment') return <FileText className="h-4 w-4 text-muted-foreground" />;
  if (type === 'submission') return <FileCode2 className="h-4 w-4 text-muted-foreground" />;
  return <UserIcon className="h-4 w-4 text-muted-foreground" />;
}

const TYPE_LABEL_KEY: Record<SearchType, string> = {
  person: 'cmdk.group.users',
  submission: 'cmdk.group.submissions',
  course: 'cmdk.group.courses',
  assignment: 'cmdk.group.assignments',
};

function buildHref(type: SearchType, id: string, slug?: string): string {
  if (type === 'course') return slug ? `/courses/${slug}` : `/courses/${id}`;
  if (type === 'assignment') return `/assignments/${id}`;
  if (type === 'submission') return `/submissions/${id}`;
  return `/u/${id}`;
}

interface QuickAction {
  id: string;
  labelKey: string;
  to: string;
  icon: JSX.Element;
}

function quickActionsForRole(role: string | undefined): QuickAction[] {
  const isStudent = role === 'student';
  const base: QuickAction[] = [
    { id: 'home', labelKey: 'cmdk.quick.dashboard', to: '/', icon: <Home className="h-4 w-4 text-muted-foreground" /> },
  ];
  // A student's dashboard (home) *is* their course list, so a separate
  // "Courses" entry pointed at the same screen — two identical search hits.
  // Only staff get a distinct courses destination (the real /courses list,
  // not /me/assignments which redirects students back to home).
  if (!isStudent) {
    base.push({ id: 'courses', labelKey: 'cmdk.quick.courses', to: '/courses', icon: <BookOpen className="h-4 w-4 text-muted-foreground" /> });
  }
  base.push(
    { id: 'profile', labelKey: 'cmdk.quick.profile', to: '/me/profile', icon: <UserIcon className="h-4 w-4 text-muted-foreground" /> },
    { id: 'notifications', labelKey: 'cmdk.quick.notifications', to: '/notifications', icon: <Bell className="h-4 w-4 text-muted-foreground" /> },
  );
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

  const go = useCallback(
    (to: string) => {
      navigate(to);
      onClose();
    },
    [navigate, onClose],
  );

  const seeAll = useCallback(() => {
    go(`/search?q=${encodeURIComponent(trimmed)}`);
  }, [go, trimmed]);

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
            {/* No magnifier here — CommandInput already renders one; a
                second icon on the hint row read as "two search icons". */}
            <div className="px-4 py-3 text-xs text-muted-foreground">
              {t('cmdk.hint')}
            </div>
            <CommandSeparator />
            <CommandGroup heading={t('cmdk.group.quick')}>
              {quick.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`quick-${a.id} ${t(a.labelKey)}`}
                  onSelect={() => go(a.to)}
                  className="gap-3"
                  data-testid={`cmdk-quick-${a.id}`}
                >
                  {a.icon}
                  <span className="flex-1 truncate text-sm">{t(a.labelKey)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : (
          <>
            {/* Pinned first → Enter opens the full results page. */}
            <CommandGroup>
              <CommandItem
                value={`__all__ ${trimmed}`}
                onSelect={seeAll}
                className="gap-3"
                data-testid="cmdk-see-all"
              >
                <SearchIcon className="h-4 w-4 text-primary" />
                <span className="flex-1 truncate text-sm">
                  {t('cmdk.see_all', { query: trimmed })}
                </span>
                <kbd className="rounded border border-border px-1 text-[10px] text-muted-foreground">
                  ↵
                </kbd>
              </CommandItem>
            </CommandGroup>
            {isLoading ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                {t('cmdk.loading')}
              </div>
            ) : groups.length === 0 ? (
              <CommandEmpty>{t('cmdk.no_results')}</CommandEmpty>
            ) : (
              groups.map((g) => (
                <CommandGroup key={g.type} heading={t(TYPE_LABEL_KEY[g.type])}>
                  {g.items.map((r) => (
                    <CommandItem
                      key={`${g.type}-${r.id}`}
                      value={`${g.type}-${r.id} ${r.title} ${r.subtitle ?? ''}`}
                      onSelect={() => go(buildHref(g.type, r.id, r.slug))}
                      className="gap-3"
                    >
                      {typeIcon(g.type)}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm">{r.title}</div>
                        {r.subtitle && (
                          <div className="truncate text-xs text-muted-foreground">
                            {r.subtitle}
                          </div>
                        )}
                      </div>
                      {g.type === 'person' && r.role && (
                        <RoleBadge role={r.role} className="flex-none" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
