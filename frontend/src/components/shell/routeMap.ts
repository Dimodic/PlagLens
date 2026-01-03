/**
 * Route → screen-id mapping. Mirrors the route schema from the design source
 * (see PlagLens-design-src/src/shell.jsx and app.jsx) so that:
 *
 *  - Sidebar can light up the correct nav entry for a given URL.
 *  - Topbar can resolve a single screen title from the location.
 *  - Keyboard shortcuts ("g+c", "g+a", …) can map to concrete URLs.
 *
 * Screen ids match the design's shorthand (courses, assignment, similarity, …)
 * so the i18n keys (title.<screen>) line up 1:1 with the design's t() calls.
 */
import type { GlobalRole } from '@/api/types';

export type Screen =
  // teacher
  | 'workspace'
  | 'courses'
  | 's_course'
  | 'course-settings'
  | 'course-members'
  | 'course-groups'
  | 'course-invitations'
  | 'course-stats'
  | 'course-dashboard'
  | 'course-suspicious'
  | 'homework'
  | 'homework-new'
  | 'homework-assignment-new'
  | 'assignment'
  | 'submissions'
  | 'submission'
  | 'similarity'
  | 'diff'
  | 'imports'
  | 'activity'
  | 'integrations'
  | 'integration'
  | 'llm'
  | 'settings'
  // student
  | 's_home'
  | 's_assignments_list'
  | 's_assignment'
  | 's_grades'
  | 's_settings'
  | 's_submission'
  | 's_inbox'
  | 's_profile'
  // admin / tenant
  | 'a_home'
  | 'a_users'
  | 'a_audit'
  | 'a_integrations'
  | 'a_settings'
  | 'tenant'
  | 'user'
  // common app surfaces (not in design but present in real router)
  | 'notifications'
  | 'profile'
  | 'security'
  | 'api_keys'
  | 'bindings'
  | 'grading'
  | 'reports'
  | 'admin'
  | 'users'
  | 'tenants'
  | 'audit'
  | 'exports';

/**
 * Resolve a screen-id from a pathname. Order matters — first match wins.
 */
export function resolveScreen(pathname: string, role: GlobalRole | undefined): Screen {
  const p = pathname.replace(/\/+$/, '') || '/';
  const isStudent = role === 'student';

  // detail pages first
  if (/^\/plagiarism-runs\/[^/]+\/pairs\//.test(p)) return 'diff';
  if (/^\/plagiarism-runs\/[^/]+/.test(p)) return 'similarity';
  if (/^\/assignments\/[^/]+\/plagiarism/.test(p)) return 'similarity';
  if (/^\/assignments\/[^/]+\/ai-analyses/.test(p)) return 'llm';
  if (/^\/assignments\/[^/]+/.test(p)) return isStudent ? 's_assignment' : 'assignment';
  if (/^\/submissions\/[^/]+\/ai-report/.test(p)) return 'llm';
  if (/^\/submissions\/[^/]+/.test(p)) return isStudent ? 's_submission' : 'submission';

  // listing pages
  if (p === '/' || p === '') return isStudent ? 's_home' : role === 'admin' ? 'a_home' : 'workspace';

  // Course detail + sub-pages — order matters, longest first.
  if (/^\/courses\/[^/]+\/settings$/.test(p)) return 'course-settings';
  if (/^\/courses\/[^/]+\/members$/.test(p)) return 'course-members';
  if (/^\/courses\/[^/]+\/groups$/.test(p)) return 'course-groups';
  if (/^\/courses\/[^/]+\/invitations$/.test(p)) return 'course-invitations';
  if (/^\/courses\/[^/]+\/stats$/.test(p)) return 'course-stats';
  if (/^\/courses\/[^/]+\/dashboard$/.test(p)) return 'course-dashboard';
  if (/^\/courses\/[^/]+\/suspicious$/.test(p)) return 'course-suspicious';
  // Homeworks (longest first)
  if (/^\/courses\/[^/]+\/homeworks\/[^/]+\/assignments\/new$/.test(p))
    return 'homework-assignment-new';
  if (/^\/courses\/[^/]+\/homeworks\/new$/.test(p)) return 'homework-new';
  if (/^\/courses\/[^/]+\/homeworks\/[^/]+$/.test(p)) return 'homework';
  if (/^\/courses\/[^/]+$/.test(p)) return 's_course';
  if (p === '/courses' || p.startsWith('/courses/')) return 'courses';
  if (p === '/me/assignments') return isStudent ? 's_assignments_list' : 'assignment';
  if (p === '/me/grades') return 's_grades';
  if (p === '/me/settings') return 's_settings';
  if (p === '/me/submissions') return isStudent ? 's_submission' : 'submissions';
  if (p === '/me') return isStudent ? 's_home' : 'profile';
  if (p === '/me/profile') return 'profile';
  if (p === '/me/security') return 'security';
  if (p === '/me/api-keys') return 'api_keys';
  if (p === '/me/external-bindings') return 'bindings';
  if (p === '/me/exports') return 'exports';
  if (p.startsWith('/me/notifications')) return 'notifications';

  if (p === '/grading') return 'grading';
  if (p === '/reports') return 'reports';
  if (p === '/notifications') return 'notifications';

  // Top-level shortcuts (canonical URLs surfaced in the teacher sidebar).
  if (p === '/imports') return 'imports';
  if (p === '/activity') return 'activity';
  if (p === '/integrations') return 'integrations';
  if (p === '/llm') return 'llm';
  if (p === '/settings') return 'settings';

  if (p === '/admin' || p === '/admin/overview') return 'a_home';
  if (/^\/admin\/users\/(?!new$)[^/]+$/.test(p)) return 'user';
  if (p.startsWith('/admin/users')) return 'a_users';
  if (/^\/admin\/tenants\/(?!new$)[^/]+$/.test(p)) return 'tenant';
  if (p.startsWith('/admin/tenants')) return 'tenants';
  if (p.startsWith('/admin/audit')) return 'a_audit';
  if (/^\/admin\/integrations\/(?!new$|webhooks$)[^/]+$/.test(p)) return 'integration';
  if (p.startsWith('/admin/integrations')) return 'a_integrations';
  if (p.startsWith('/admin/notifications')) return 'notifications';
  if (p.startsWith('/admin/ai')) return 'llm';
  if (p.startsWith('/admin/plagiarism-corpus')) return 'similarity';
  if (p.startsWith('/admin/system') || p.startsWith('/admin/settings')) return 'a_settings';
  if (p.startsWith('/admin/roles')) return 'a_settings';
  if (p.startsWith('/admin/metrics')) return 'a_home';
  if (p.startsWith('/admin/exports')) return 'exports';
  if (p.startsWith('/admin/dashboard')) return 'a_home';

  return isStudent ? 's_home' : role === 'admin' ? 'a_home' : 'workspace';
}

/**
 * i18n key for a screen's Topbar title.
 */
export function titleKey(screen: Screen): string {
  return `title.${screen}`;
}

/**
 * Detail screens that get a back button in the topbar.
 */
export function isBackable(screen: Screen): boolean {
  switch (screen) {
    case 'assignment':
    case 'similarity':
    case 'diff':
    case 's_assignment':
    case 's_submission':
    case 's_course':
    case 'submission':
    case 'user':
    case 'integration':
    case 'tenant':
    case 'course-settings':
    case 'course-members':
    case 'course-groups':
    case 'course-invitations':
    case 'course-stats':
    case 'course-dashboard':
    case 'course-suspicious':
    case 'homework':
    case 'homework-new':
    case 'homework-assignment-new':
      return true;
    default:
      return false;
  }
}

/**
 * Map a "back" action for a given screen to a target pathname.
 * Falls back to history.back() at call site if returns null.
 *
 * `pathname` is the current location.pathname — used to extract URL params
 * (e.g. `:slug` so course sub-pages can return to their parent course).
 */
export function backTarget(screen: Screen, pathname?: string): string | null {
  switch (screen) {
    case 'assignment':
    case 'similarity':
    case 'diff':
      return '/courses';
    case 's_assignment':
    case 's_submission':
      return '/me';
    case 's_course':
      return '/courses';
    case 'course-settings':
    case 'course-members':
    case 'course-groups':
    case 'course-invitations':
    case 'course-stats':
    case 'course-dashboard':
    case 'course-suspicious': {
      // /courses/<slug>/<sub> → /courses/<slug>
      const m = (pathname ?? '').match(/^\/courses\/([^/]+)\//);
      return m ? `/courses/${m[1]}` : '/courses';
    }
    case 'homework':
    case 'homework-new': {
      // homework detail / new → back to course
      const m = (pathname ?? '').match(/^\/courses\/([^/]+)\//);
      return m ? `/courses/${m[1]}` : '/courses';
    }
    case 'homework-assignment-new': {
      // /courses/<slug>/homeworks/<hwSlug>/assignments/new → homework detail
      const m = (pathname ?? '').match(
        /^\/courses\/([^/]+)\/homeworks\/([^/]+)\//,
      );
      return m ? `/courses/${m[1]}/homeworks/${m[2]}` : '/courses';
    }
    case 'submission':
      return '/grading';
    case 'user':
      return '/admin/users';
    case 'integration':
      return '/admin/integrations';
    case 'tenant':
      return '/admin/tenants';
    default:
      return null;
  }
}

/**
 * Parent route target — used for breadcrumbs / parent-chain navigation.
 *
 * Returns the parent's pathname for a given screen, or null if the screen has
 * no parent route (top-level destinations). Distinct from `backTarget` because
 * back targets sometimes go to a list (`/courses`) rather than a true parent.
 *
 * Currently consumed by the upcoming breadcrumb component; left here as a
 * stable surface so other code can reuse parent-chain logic.
 */
export function parentTarget(
  screen: Screen,
  pathname?: string,
): string | null {
  switch (screen) {
    case 'homework':
    case 'homework-new': {
      const m = (pathname ?? '').match(/^\/courses\/([^/]+)\//);
      return m ? `/courses/${m[1]}` : null;
    }
    case 'homework-assignment-new': {
      const m = (pathname ?? '').match(
        /^\/courses\/([^/]+)\/homeworks\/([^/]+)\//,
      );
      return m ? `/courses/${m[1]}/homeworks/${m[2]}` : null;
    }
    case 'assignment':
    case 's_assignment': {
      // Legacy: assignment detail's parent is the course (no slug visible from
      // /assignments/:id alone). Breadcrumb agent will need to resolve via
      // assignment.homework_id when it implements full parent chain.
      return '/courses';
    }
    case 'course-settings':
    case 'course-members':
    case 'course-groups':
    case 'course-invitations':
    case 'course-stats':
    case 'course-dashboard':
    case 'course-suspicious': {
      const m = (pathname ?? '').match(/^\/courses\/([^/]+)\//);
      return m ? `/courses/${m[1]}` : '/courses';
    }
    case 's_course':
      return '/courses';
    default:
      return null;
  }
}
