import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { Breadcrumbs } from '@/components/shell/Breadcrumbs';
import { CommandPalette } from '@/components/shell/CommandPalette';
import { useKeyboardShortcuts } from '@/components/shell/useKeyboardShortcuts';
import { useAuth } from '@/auth/useAuth';
import { useMyCourses } from '@/hooks/api/useCourses';

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { user } = useAuth();

  useKeyboardShortcuts({
    onHelp: () => { /* TODO: help dialog */ },
    onSearch: () => setSearchOpen(true),
  });

  // Sidebar visibility heuristic (unchanged): hide for "pure" students who
  // are not assistants in any course.
  const myCoursesQ = useMyCourses();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myCourses: any[] = Array.isArray(myCoursesQ.data)
    ? myCoursesQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((myCoursesQ.data as any)?.data ?? []);
  const isStaffSomewhere = myCourses.some(
    (c) =>
      c?.role &&
      (c.role === 'assistant' ||
        c.role === 'owner' ||
        c.role === 'co_owner' ||
        c.role === 'teacher'),
  );
  const isPureStudent =
    user?.global_role === 'student' && !isStaffSomewhere;
  const showSidebar = !isPureStudent;

  return (
    <div
      data-testid="app-shell"
      className="flex min-h-screen bg-background text-foreground"
    >
      {showSidebar && (
        <Sidebar
          mobileOpen={mobileNavOpen}
          onMobileClose={() => setMobileNavOpen(false)}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenSearch={() => setSearchOpen(true)}
          onOpenMobileNav={showSidebar ? () => setMobileNavOpen(true) : undefined}
        />
        <main data-testid="app-main" className="min-w-0 flex-1">
          {/* Breadcrumb rail tracks the *current* page's container width
              via the `--page-max-w` CSS variable that <Page> publishes
              on the document root. Crucially, the wrapper has to mirror
              the Outlet's structure exactly — `px-6` on the OUTER div
              and `mx-auto max-w-<…>` on the INNER one — because <Page>
              does the same: its parent <div w-full px-6> takes the
              padding and Page itself only does `mx-auto max-w-<…>`. If
              we collapse this into a single `mx-auto max-w-<…> px-6`
              the breadcrumb ends up 24 px to the right of the page
              content on wide viewports (the padding lands *inside* the
              max-width instead of outside it). Fallback 1080px handles
              routes without a <Page> (auth, oauth callbacks, errors).
              Vertical breathing room: pt-5 above the bread + pt-6 below
              keeps the bread visually separate from the h1 it sits over. */}
          <div className="w-full px-6 pt-5">
            <div
              className="mx-auto w-full"
              style={{ maxWidth: 'var(--page-max-w, 1080px)' }}
            >
              <Breadcrumbs />
            </div>
          </div>
          <div className="w-full px-6 pb-12 pt-6">
            <Outlet />
          </div>
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
