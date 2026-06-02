/**
 * Sidebar — Kaggle-style rail that *expands in place* on hover.
 *
 * Desktop (>= 768px):
 *   • A single sidebar element that's 72px wide (icon rail) and smoothly
 *     widens to 256px on hover, revealing labels. It's NOT a separate
 *     drawer sliding over the rail — the same element grows.
 *   • It's an overlay (position: fixed) with a 72px in-flow spacer holding
 *     the layout, so page content never shifts when it expands.
 *   • A hover-intent delay before opening lets you click a rail icon before
 *     it widens. Each nav row is full rail width (no floating square).
 *
 * Mobile (< 768px):
 *   • Sidebar hidden; the topbar hamburger opens a full overlay drawer.
 */
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  FileText,
  Table2,
  FileSpreadsheet,
  ClipboardCheck,
  LogIn,
  Plug,
  Settings2,
  Inbox,
  Users,
  ShieldCheck,
  FileClock,
  Bell,
  Building2,
} from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { useAuth } from '@/auth/useAuth';
import { useTranslation } from '@/i18n';
import type { GlobalRole } from '@/api/types';
import { resolveScreen, type Screen } from './routeMap';
import { Wordmark } from './Wordmark';

interface NavLeaf {
  id: string;
  screenId?: Screen;
  label: string;
  icon: ReactNode;
  to: string;
  matches?: string[];
}

interface NavSection {
  label: string;
  items: NavLeaf[];
}

const ic = (Icon: typeof LayoutGrid) => <Icon className="h-[22px] w-[22px]" />;

function deriveRole(
  role: GlobalRole | undefined,
): 'student' | 'teacher' | 'assistant' | 'admin' {
  if (role === 'student') return 'student';
  if (role === 'admin') return 'admin';
  if (role === 'assistant') return 'assistant';
  return 'teacher';
}

function buildSections(
  role: 'student' | 'teacher' | 'assistant' | 'admin',
  isAdmin: boolean,
  t: (k: string) => string,
): NavSection[] {
  if (role === 'admin') {
    const items: NavLeaf[] = [
      { id: 'a_home', screenId: 'a_home', label: t('nav.overview'), icon: ic(LayoutGrid), to: '/admin' },
    ];
    if (isAdmin) {
      items.push({
        id: 'a_tenants', screenId: 'tenants', label: t('nav.admin.tenants'), icon: ic(Building2), to: '/admin/tenants',
      });
    }
    items.push(
      { id: 'a_users', screenId: 'a_users', label: t('nav.users'), icon: ic(Users), to: '/admin/users' },
      { id: 'a_roles', label: t('nav.admin.roles'), icon: ic(ShieldCheck), to: '/admin/roles' },
      { id: 'a_login', screenId: 'a_login', label: t('nav.login'), icon: ic(LogIn), to: '/admin/login-providers' },
      { id: 'a_integrations', screenId: 'a_integrations', label: t('nav.integrations'), icon: ic(Plug), to: '/admin/integrations', matches: ['/integrations'] },
      { id: 'a_notifications', label: t('nav.admin.notifications'), icon: ic(Bell), to: '/admin/notifications/email' },
      { id: 'a_audit', screenId: 'a_audit', label: t('nav.audit'), icon: ic(FileClock), to: '/admin/audit' },
      { id: 'a_system', label: t('nav.system'), icon: ic(Settings2), to: '/admin/system/settings' },
    );
    return [{ label: t('nav.tenant'), items }];
  }

  if (role === 'student') {
    return [{
      label: t('nav.studies'),
      items: [
        { id: 's_home', screenId: 's_home', label: t('nav.home'), icon: ic(LayoutGrid), to: '/me' },
        { id: 's_assignment', screenId: 's_assignment', label: t('nav.my_assignments'), icon: ic(FileText), to: '/me/assignments' },
        { id: 's_submission', screenId: 's_submission', label: t('nav.my_submissions'), icon: ic(Table2), to: '/me/submissions' },
        { id: 's_inbox', screenId: 's_inbox', label: t('nav.inbox'), icon: ic(Inbox), to: '/notifications' },
      ],
    }];
  }

  if (role === 'assistant') {
    return [
      {
        label: t('nav.workspace'),
        items: [
          { id: 'grading', screenId: 'grading', label: t('nav.grading'), icon: ic(ClipboardCheck), to: '/grading' },
          { id: 'courses', screenId: 'courses', label: t('nav.courses'), icon: ic(LayoutGrid), to: '/courses' },
          { id: 'submissions', screenId: 'submissions', label: t('nav.all_submissions'), icon: ic(Table2), to: '/submissions' },
          { id: 'reports', screenId: 'reports', label: t('nav.reports'), icon: ic(FileSpreadsheet), to: '/reports' },
        ],
      },
    ];
  }

  return [
    {
      label: t('nav.workspace'),
      items: [
        { id: 'courses', screenId: 'courses', label: t('nav.courses'), icon: ic(LayoutGrid), to: '/courses' },
        { id: 'submissions', screenId: 'submissions', label: t('nav.submissions'), icon: ic(Table2), to: '/submissions' },
        { id: 'similarity', screenId: 'reports', label: t('nav.reports'), icon: ic(FileSpreadsheet), to: '/reports' },
      ],
    },
    {
      label: t('nav.tools'),
      items: [
        { id: 'integrations', screenId: 'integrations', label: t('nav.integrations'), icon: ic(Plug), to: '/integrations' },
      ],
    },
  ];
}

interface SidebarProps {
  /** Whether mobile overlay is open. Owned by AppShell. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  className?: string;
}

// Hover-intent delay before the rail widens — long enough that a "reach for
// a rail icon and click it" gesture finishes before the rail grows. Close
// is instant.
const OPEN_DELAY_MS = 650;
// Collapsed rail width; icons centre in this slot in both states (no jump).
const RAIL_W = 72;

export function Sidebar({ mobileOpen = false, onMobileClose, className }: SidebarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const openTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setHovered(false);
  }, [location.pathname]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  const onEnter = useCallback(() => {
    if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
    openTimerRef.current = window.setTimeout(() => {
      setHovered(true);
      openTimerRef.current = null;
    }, OPEN_DELAY_MS);
  }, []);
  const onLeave = useCallback(() => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setHovered(false);
  }, []);

  if (!user) return null;

  const role = deriveRole(user.global_role);
  const isAdmin = user.global_role === 'admin';
  const items = buildSections(role, isAdmin, t).flatMap((s) => s.items);
  const activeScreen = resolveScreen(location.pathname, user.global_role);

  return (
    <>
      {/* Desktop: 72px spacer reserves the layout; the real sidebar below is
          an overlay that widens in place, so content never shifts. */}
      <div className="hidden md:block shrink-0" style={{ width: RAIL_W }} aria-hidden />
      <aside
        data-testid="app-sidebar"
        data-expanded={hovered ? 'true' : 'false'}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col overflow-hidden',
          'border-r border-sidebar-border/30 bg-sidebar text-sidebar-foreground',
          'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          hovered ? 'shadow-[8px_0_28px_-14px_rgba(0,0,0,0.35)]' : '',
          className,
        )}
        style={{ width: hovered ? 256 : RAIL_W }}
      >
        <div className="flex h-14 shrink-0 items-center">
          <Wordmark
            variant="full"
            railAligned
            textRevealed={hovered}
            data-testid="wordmark-rail"
          />
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden py-3">
          <ul className="flex flex-col gap-1">
            {items.map((leaf) => (
              <li key={leaf.id}>
                <NavRow
                  leaf={leaf}
                  expanded={hovered}
                  activeScreen={activeScreen}
                  pathname={location.pathname}
                />
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Mobile drawer — backdrop + sheet, toggled by AppShell. */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div
            data-testid="app-sidebar-mobile-backdrop"
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
            onClick={onMobileClose}
          />
          <aside
            data-testid="app-sidebar-mobile"
            className="absolute left-0 top-0 flex h-full w-72 flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl"
          >
            <div className="flex h-14 shrink-0 items-center">
              <Wordmark variant="full" railAligned />
            </div>
            <nav className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden py-3">
              <ul className="flex flex-col gap-1">
                {items.map((leaf) => (
                  <li key={leaf.id}>
                    <NavRow
                      leaf={leaf}
                      expanded
                      activeScreen={activeScreen}
                      pathname={location.pathname}
                    />
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

function isLeafActive(leaf: NavLeaf, activeScreen: Screen, pathname: string): boolean {
  if (leaf.screenId && leaf.screenId === activeScreen) return true;
  const norm = pathname.replace(/\/+$/, '') || '/';
  if (norm === leaf.to) return true;
  if (leaf.matches && leaf.matches.some((p) => norm === p || norm.startsWith(p + '/'))) {
    return true;
  }
  return false;
}

interface NavRowProps {
  leaf: NavLeaf;
  expanded: boolean;
  activeScreen: Screen;
  pathname: string;
}

function NavRow({ leaf, expanded, activeScreen, pathname }: NavRowProps) {
  const on = isLeafActive(leaf, activeScreen, pathname);
  return (
    <Link
      to={leaf.to}
      data-testid={`nav-item-${leaf.id}`}
      data-active={on ? 'true' : undefined}
      aria-label={leaf.label}
      title={!expanded ? leaf.label : undefined}
      // The row is always full rail width (a band, never a floating square).
      // The icon sits in a fixed RAIL_W slot so it stays centred in the
      // collapsed rail AND keeps the same x when the rail widens — the label
      // just reveals to its right (clipped by the sidebar's overflow-hidden
      // while collapsed).
      className={cn(
        'group flex h-12 items-center rounded-md transition-colors',
        on
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      <span
        className="flex h-full shrink-0 items-center justify-center"
        style={{ width: RAIL_W }}
      >
        {leaf.icon}
      </span>
      <span
        className={cn(
          'truncate whitespace-nowrap pr-3 text-[15px] font-medium transition-opacity duration-200',
          expanded ? 'opacity-100' : 'opacity-0',
        )}
      >
        {leaf.label}
      </span>
    </Link>
  );
}
