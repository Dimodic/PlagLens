/**
 * Sidebar — Kaggle-style icon rail with hover-peek + a pin toggle.
 *
 * Desktop (>= 768px):
 *   • 72px icon rail that widens to 256px when expanded, revealing labels.
 *   • Hover-peek: hovering the rail (after a short intent delay) opens it as
 *     an OVERLAY — page content does NOT move; moving away collapses it.
 *   • Pin: the hamburger at the top toggles a persistent open state
 *     (remembered in localStorage). While pinned the rail stays open AND the
 *     layout reserves the full 256px, so page content reflows to its right
 *     instead of sitting under an overlay.
 *   • expanded = pinned || hovered.
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
  Menu,
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

// Hover-intent delay before the rail peeks open — long enough that a "reach
// for a rail icon and click it" gesture finishes before it widens.
const OPEN_DELAY_MS = 650;
// Collapsed rail width; icons centre in this slot in both states (no jump).
const RAIL_W = 72;
// Expanded drawer width.
const DRAWER_W = 256;
// localStorage key for the pinned-open preference (persists across reloads).
const PIN_KEY = 'plaglens:sidebar-pinned';

export function Sidebar({ mobileOpen = false, onMobileClose, className }: SidebarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  // Pinned-open (hamburger) persists across reloads; hover-peek is transient.
  // The rail is wide when EITHER is true.
  const [pinned, setPinned] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PIN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [hovered, setHovered] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const expanded = pinned || hovered;

  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Drop a transient hover-peek when navigating (a pinned rail stays open).
  // Without this the rail would linger open over the new page until the
  // mouse happened to move away.
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
  const togglePinned = useCallback(() => {
    setPinned((p) => {
      const next = !p;
      try {
        localStorage.setItem(PIN_KEY, next ? '1' : '0');
      } catch {
        /* storage disabled (private mode) — pin stays in-memory only */
      }
      return next;
    });
    // A click is an explicit intent: drop any active/pending hover-peek so
    // collapsing closes the rail IMMEDIATELY, instead of lingering open until
    // the cursor finally leaves the icon. A fresh hover re-opens the peek.
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
      {/* Desktop spacer: 72px normally (the rail overlays content on
          hover-peek), but grows to 256px while PINNED so page content
          reflows to its right — the Kaggle behaviour. Animates in step with
          the sidebar width. */}
      <div
        className="hidden md:block shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ width: pinned ? DRAWER_W : RAIL_W }}
        aria-hidden
      />
      <aside
        data-testid="app-sidebar"
        data-expanded={expanded ? 'true' : 'false'}
        data-pinned={pinned ? 'true' : 'false'}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={cn(
          'hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col overflow-hidden',
          'border-r border-sidebar-border/30 bg-sidebar text-sidebar-foreground',
          'transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
          // Shadow only while peeking as an overlay — when pinned the rail is
          // flush against the reflowed content, so a drop shadow looks wrong.
          hovered && !pinned ? 'shadow-[8px_0_28px_-14px_rgba(0,0,0,0.35)]' : '',
          className,
        )}
        style={{ width: expanded ? DRAWER_W : RAIL_W }}
      >
        {/* Top bar: hamburger (pin toggle) + the wordmark beside it. The
            hamburger highlights ONLY on hover — it's centred in the same 72px
            slot as the nav icons below so it doesn't shift on expand; the
            wordmark (also the home link) reveals to its right when expanded. */}
        <div className="flex h-14 shrink-0 items-center">
          <span
            className="flex shrink-0 items-center justify-center"
            style={{ width: RAIL_W }}
          >
            <button
              type="button"
              onClick={togglePinned}
              aria-label={t(pinned ? 'sidebar.collapse' : 'sidebar.expand')}
              aria-expanded={pinned}
              aria-pressed={pinned}
              data-testid="sidebar-toggle"
              className="flex h-10 w-10 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
          </span>
          <Wordmark
            variant="full"
            data-testid="wordmark-rail"
            className={cn(
              'transition-opacity duration-200',
              expanded ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto overflow-x-hidden py-3">
          <ul className="flex flex-col gap-1">
            {items.map((leaf) => (
              <li key={leaf.id}>
                <NavRow
                  leaf={leaf}
                  expanded={expanded}
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
