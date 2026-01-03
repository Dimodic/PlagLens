/**
 * Sidebar — Kaggle-style icon-rail + hover-expanded overlay drawer.
 *
 * Default state on desktop (>= 768px):
 *   • A 64px-wide rail with icon-only nav items is always visible.
 *   • On mouseenter ANYWHERE over the rail, an absolutely-positioned drawer
 *     (256px wide) opens over the content. Content does NOT shift.
 *   • On mouseleave the rail/drawer combo, the drawer closes.
 *   • No localStorage. No hover-expand suppression.
 *
 * Mobile (< 768px):
 *   • Rail hidden. Topbar shows a hamburger that toggles an overlay drawer
 *     (state lifted to AppShell via the prop `mobileOpen` / `onMobileClose`).
 *   • No hover-expand on touch.
 */
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  FileText,
  Table2,
  FileSpreadsheet,
  Plug,
  Brain,
  Settings,
  Inbox,
  Users,
  ShieldAlert,
  ScrollText,
  Bell,
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
}

interface NavSection {
  label: string;
  items: NavLeaf[];
}

// Larger glyphs to match the Kaggle-style enlarged nav rows.
const ic = (Icon: typeof LayoutGrid) => <Icon className="h-[22px] w-[22px]" />;

function deriveRole(role: GlobalRole | undefined): 'student' | 'teacher' | 'admin' {
  if (role === 'student') return 'student';
  if (role === 'admin' || role === 'super_admin') return 'admin';
  return 'teacher';
}

/**
 * Flat nav: rail + drawer expose the same items, no expand/collapse groups.
 * Sub-pages of admin sections are accessed via the page itself once you land
 * on the section root.
 */
function buildSections(
  role: 'student' | 'teacher' | 'admin',
  isSuperAdmin: boolean,
  t: (k: string) => string,
): NavSection[] {
  if (role === 'admin') {
    const tenantItems: NavLeaf[] = [
      { id: 'a_home', screenId: 'a_home', label: t('nav.overview'), icon: ic(LayoutGrid), to: '/admin/overview' },
      { id: 'a_users', screenId: 'a_users', label: t('nav.users'), icon: ic(Users), to: '/admin/users' },
      { id: 'a_audit', screenId: 'a_audit', label: t('nav.audit'), icon: ic(ScrollText), to: '/admin/audit' },
      { id: 'a_roles', label: t('nav.admin.roles'), icon: ic(ShieldAlert), to: '/admin/roles' },
    ];
    if (isSuperAdmin) {
      tenantItems.push({
        id: 'a_tenants', screenId: 'tenants', label: t('nav.admin.tenants'), icon: ic(LayoutGrid), to: '/admin/tenants',
      });
    }
    return [
      { label: t('nav.tenant'), items: tenantItems },
      {
        label: t('nav.admin.notifications'),
        items: [
          { id: 'a_notifications', label: t('nav.admin.notifications'), icon: ic(Bell), to: '/admin/notifications/email' },
        ],
      },
      {
        label: t('nav.admin.ai'),
        items: [
          { id: 'a_ai', label: t('nav.admin.ai'), icon: ic(Brain), to: '/admin/ai/providers' },
        ],
      },
      {
        label: t('nav.integrations'),
        items: [
          { id: 'a_integrations', screenId: 'a_integrations', label: t('nav.integrations'), icon: ic(Plug), to: '/admin/integrations' },
        ],
      },
      {
        label: t('nav.system'),
        items: [
          { id: 'a_system', label: t('nav.system'), icon: ic(Settings), to: '/admin/system/settings' },
        ],
      },
    ];
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

  // Teacher / assistant sidebar — only routes they actually have access
  // to. `/activity` and `/llm` are admin/super_admin-only (RoleGuard
  // silently redirects), so they must NOT appear here — showing a nav
  // item that "doesn't go where it says" is a UX trap. "Мои задания"
  // (/me/assignments) is a student view — a teacher/assistant works
  // through courses, not a personal assignment feed — so it's dropped
  // here. Admin sidebar (built below) has its own list.
  //
  // No standalone "Импорт" item: importing student submissions is now
  // consolidated inside "Интеграции" (one import surface instead of the
  // half-dozen scattered pages). "Экспорт" (/reports) is the outbound
  // side — grades → Google Sheets / CSV.
  return [
    {
      label: t('nav.workspace'),
      items: [
        { id: 'courses', screenId: 'courses', label: t('nav.courses'), icon: ic(LayoutGrid), to: '/courses' },
        { id: 'submissions', screenId: 'submissions', label: t('nav.submissions'), icon: ic(Table2), to: '/me/submissions' },
        { id: 'similarity', screenId: 'reports', label: t('nav.reports'), icon: ic(FileSpreadsheet), to: '/reports' },
      ],
    },
    {
      label: t('nav.tools'),
      items: [
        { id: 'integrations', screenId: 'integrations', label: t('nav.integrations'), icon: ic(Plug), to: '/integrations' },
        { id: 'settings', screenId: 'settings', label: t('nav.settings'), icon: ic(Settings), to: '/settings' },
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

// Delay before the hover-drawer expands. Tuned so the typical reach-then-click
// gesture (mouse-travel ~250ms + dwell ~200ms + click ~100ms ≈ 550ms) finishes
// BEFORE the drawer covers the rail icon. Mouse-leave is instant — once they
// intend to leave, get out of the way.
const DRAWER_OPEN_DELAY_MS = 700;

export function Sidebar({ mobileOpen = false, onMobileClose, className }: SidebarProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const openTimerRef = useRef<number | null>(null);

  // Close mobile drawer when route changes.
  useEffect(() => {
    if (mobileOpen) onMobileClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // When the route changes, also collapse the hover drawer — clicking a nav
  // item navigates AND should close the overlay, otherwise the drawer
  // lingers over the new content.
  useEffect(() => {
    if (openTimerRef.current) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    setHovered(false);
  }, [location.pathname]);

  // Clean up any pending open-timer on unmount.
  useEffect(() => {
    return () => {
      if (openTimerRef.current) window.clearTimeout(openTimerRef.current);
    };
  }, []);

  // Esc closes mobile drawer.
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
    }, DRAWER_OPEN_DELAY_MS);
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
  const isSuperAdmin = user.global_role === 'super_admin';
  const sections = buildSections(role, isSuperAdmin, t);
  const activeScreen = resolveScreen(location.pathname, user.global_role);

  return (
    <>
      {/* Desktop rail + hover drawer. Hidden under 768px. */}
      <aside
        data-testid="app-sidebar"
        data-expanded={hovered ? 'true' : 'false'}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        className={cn(
          'hidden md:block',
          // Wider rail (was w-16 / 64px) to host larger touch targets +
          // breathing room under the glyph — matches Kaggle's left chrome.
          'sticky top-0 z-40 h-screen w-[72px] shrink-0',
          'border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
          className,
        )}
      >
        {/* The rail itself — always visible, icon-only */}
        <RailContents
          sections={sections}
          activeScreen={activeScreen}
          pathname={location.pathname}
        />

        {/* Hover drawer — absolutely positioned, overlays the page. The
            drawer is a sibling of the rail content inside the same <aside>
            so mouseenter/leave on the parent catches both. */}
        <div
          data-testid="app-sidebar-drawer"
          aria-hidden={!hovered}
          // 288px (was 256) gives the larger labels room to breathe and
          // keeps Russian translations from squeezing.
          className={cn(
            'absolute left-0 top-0 h-screen w-72',
            'border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
            'shadow-[6px_0_24px_-12px_rgba(0,0,0,0.18)]',
            'transition-[opacity,transform] duration-150 ease-out',
            hovered
              ? 'opacity-100 translate-x-0 pointer-events-auto'
              : 'opacity-0 -translate-x-1 pointer-events-none',
          )}
        >
          <DrawerContents
            sections={sections}
            activeScreen={activeScreen}
            pathname={location.pathname}
          />
        </div>
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
            className="absolute left-0 top-0 h-full w-72 bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl"
          >
            <DrawerContents
              sections={sections}
              activeScreen={activeScreen}
              pathname={location.pathname}
            />
          </aside>
        </div>
      )}
    </>
  );
}

interface ContentsProps {
  sections: NavSection[];
  activeScreen: Screen;
  pathname: string;
}

function RailContents({ sections, activeScreen, pathname }: ContentsProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Glyph slot — matches the wordmark vertical alignment in the drawer.
          NO border-b here: Header's own border-b runs across the full top
          edge (including this slot), so a second line would stack and the
          differing colour tokens (border vs sidebar-border) would crosshatch
          at the corner. One line is one line. */}
      <div className="flex h-14 items-center justify-center">
        <Wordmark variant="compact" data-testid="wordmark-rail" />
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto py-3">
        <ul className="flex flex-col items-center gap-1">
          {sections.flatMap((s) =>
            s.items.map((it) => (
              <li key={it.id}>
                <RailItem leaf={it} activeScreen={activeScreen} pathname={pathname} />
              </li>
            )),
          )}
        </ul>
      </nav>
    </div>
  );
}

function DrawerContents({ sections, activeScreen, pathname }: ContentsProps) {
  // Flat list — Kaggle drops the "WORKSPACE / TOOLS" group headings in
  // favour of a single uninterrupted column of large nav rows. We do the
  // same: keep the section grouping in code (still useful for ordering)
  // but render every item at the same level so the eye scans straight
  // down without sub-titles getting in the way.
  //
  // Padding here (`py-3`, `gap-1`) intentionally mirrors RailContents so
  // every row lines up horizontally with its rail counterpart on hover —
  // otherwise the drawer items would drift downwards as you scan.
  const allItems = sections.flatMap((s) => s.items);
  return (
    <div className="flex h-full flex-col">
      {/* Same as RailContents: no border-b — header line owns the top edge. */}
      <div className="flex h-14 items-center px-4">
        <Wordmark variant="full" data-testid="wordmark-drawer" />
      </div>
      <nav className="scroll-thin flex-1 overflow-y-auto px-3 py-3">
        <ul className="flex flex-col gap-1">
          {allItems.map((leaf) => (
            <li key={leaf.id}>
              <DrawerItem
                leaf={leaf}
                activeScreen={activeScreen}
                pathname={pathname}
              />
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function isLeafActive(leaf: NavLeaf, activeScreen: Screen, pathname: string): boolean {
  if (leaf.screenId && leaf.screenId === activeScreen) return true;
  const norm = pathname.replace(/\/+$/, '') || '/';
  return norm === leaf.to;
}

interface ItemProps {
  leaf: NavLeaf;
  activeScreen: Screen;
  pathname: string;
}

function RailItem({ leaf, activeScreen, pathname }: ItemProps) {
  const on = isLeafActive(leaf, activeScreen, pathname);
  return (
    <Link
      to={leaf.to}
      data-testid={`nav-item-${leaf.id}`}
      data-active={on ? 'true' : undefined}
      aria-label={leaf.label}
      title={leaf.label}
      // Larger hit-area (was 40×40) for fingertip parity with Kaggle's rail.
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-lg transition-colors',
        on
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      {leaf.icon}
    </Link>
  );
}

function DrawerItem({ leaf, activeScreen, pathname }: ItemProps) {
  const on = isLeafActive(leaf, activeScreen, pathname);
  return (
    <Link
      to={leaf.to}
      data-testid={`nav-drawer-item-${leaf.id}`}
      data-active={on ? 'true' : undefined}
      // Locked to 48px (== rail item h-12 w-12) so the drawer items sit on
      // the same baseline as their rail counterparts when the drawer
      // overlays the rail. Without the explicit height, padding + line-
      // height conspired to make every row a few px taller than the rail
      // icons and the list drifted downwards as the user scanned.
      className={cn(
        'group flex h-12 items-center gap-4 rounded-md px-3 text-[17px] font-medium transition-colors',
        on
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
      )}
    >
      <span
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center',
          on ? 'text-sidebar-primary' : 'text-muted-foreground',
        )}
      >
        {leaf.icon}
      </span>
      <span className="flex-1 truncate">{leaf.label}</span>
    </Link>
  );
}
