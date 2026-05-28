/**
 * Application routes.
 *
 * Public:
 *   /login, /register, /auth/forgot, /auth/reset, /auth/verify, /auth/oauth/callback, /demo
 *
 * Protected (under <AppShell />):
 *   / → role-based redirect
 *   /me, /me/assignments, /me/submissions, /me/2fa, /me/settings
 *   /courses, /grading, /reports, /notifications, /admin/*
 *
 * Bundle strategy: every page is `React.lazy()`'d so the initial JS
 * chunk ships only the router, auth providers, layout shell, and the
 * three pages most commonly hit on a cold load (login + demo + home
 * redirect). The Suspense boundary lives inside `AppShell` so route
 * transitions show a uniform `<PageSkeleton />` while the chunk
 * resolves. Public-route fallbacks are scoped at each `element` to
 * keep the page-level skeleton inside the auth shell consistent.
 */
import { lazy as reactLazy, Suspense, type ComponentType } from 'react';

// Reload-on-stale-chunk wrapper around React.lazy.
//
// Vite ships every route as a code-split chunk named with a content hash.
// When we deploy a new build, the hashes change — and any browser still
// holding an old index.html will try to fetch chunks that no longer exist
// on the server (5xx / 404) the next time the user clicks a not-yet-loaded
// route. The user lands on a generic 500 page even though all they needed
// was to re-fetch the HTML.
//
// Catch that case once per session: on the first import failure we trip
// a sessionStorage guard and force window.location.reload(), which pulls
// the new index.html + manifest. The guard prevents an infinite reload
// loop if a chunk is genuinely broken.
// `ComponentType<any>` — pages have wildly different prop shapes, and
// React.lazy preserves them when the factory return type isn't narrowed.
// Using `unknown` here would have to push prop-checks down to every
// site, which defeats the wrapper's "drop-in" purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyImport<T extends ComponentType<any>> = () => Promise<{
  default: T;
}>;

const STALE_CHUNK_KEY = 'plaglens.stale_chunk_reloaded';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazy<T extends ComponentType<any>>(factory: LazyImport<T>) {
  return reactLazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (
        typeof window !== 'undefined' &&
        typeof sessionStorage !== 'undefined' &&
        !sessionStorage.getItem(STALE_CHUNK_KEY)
      ) {
        sessionStorage.setItem(STALE_CHUNK_KEY, '1');
        window.location.reload();
        // Return a never-resolving promise so React holds the Suspense
        // boundary while the reload completes — instead of surfacing
        // the chunk error to ErrorBoundary first.
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
import {
  createBrowserRouter,
  Navigate,
  RouteObject,
  useParams,
} from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { RoleGuard } from '@/auth/RoleGuard';
import { AppShell } from '@/layout/AppShell';
import { PageSkeleton } from '@/components/common/Skeleton';

// Eagerly imported: tiny modules every cold load needs immediately
// (the unauth landing surface + the not-found / error boundaries).
import LoginPage from '@/pages/auth/LoginPage';
import HomeRedirect from '@/pages/app/HomeRedirect';
import NotFoundPage from '@/pages/NotFoundPage';
import ErrorPage from '@/pages/ErrorPage';

// Auth — public pages, lazy except LoginPage itself.
// RegisterPage / ForgotPasswordPage are gone: both flows live inside
// LoginPage (?mode=register / ?mode=forgot). /register and /auth/forgot
// are kept as thin redirects so old bookmarks / emails still work.
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('@/pages/auth/VerifyEmailPage'));
const OAuthCallbackPage = lazy(() => import('@/pages/auth/OAuthCallbackPage'));
const TwoFactorEnrollPage = lazy(() => import('@/pages/auth/TwoFactorEnrollPage'));
const DemoLoginPage = lazy(() => import('@/pages/auth/DemoLoginPage'));

// Self pages. /me is the single screen the student actually uses; the
// old standalone /me/assignments and /me/grades pages are gone — their
// content folded into MyDashboardPage. Routes still exist as thin
// redirects so old links (emails, notifications) keep working.
const ProfilePage = lazy(() => import('@/pages/me/ProfilePage'));
const MyApiKeysPage = lazy(() => import('@/pages/me/MyApiKeysPage'));
const MyExternalBindingsPage = lazy(() => import('@/pages/me/MyExternalBindingsPage'));
// MyAssignmentDetailPage is gone — assignment detail is unified at
// /assignments/:id (which renders the staff view, gated by role).
// /me/assignments/:id keeps its URL as a thin redirect for old links.
const MySubmissionDetailPage = lazy(() => import('@/pages/me/MySubmissionDetailPage'));

// Teacher / admin shortcuts.
const GradingQueuePage = lazy(() => import('@/pages/teacher/GradingQueuePage'));
const ActivityLogPage = lazy(() => import('@/pages/teacher/ActivityLogPage'));
const AdminProvidersPage = lazy(() => import('@/pages/admin/AdminProvidersPage'));
const AdminMetricsPage = lazy(() => import('@/pages/admin/AdminMetricsPage'));

// Plagiarism + AI.
const PlagiarismRunsListPage = lazy(() => import('@/pages/plagiarism/PlagiarismRunsListPage'));
const PlagiarismRunDetailPage = lazy(() => import('@/pages/plagiarism/PlagiarismRunDetailPage'));
const PlagiarismPairDiffPage = lazy(() => import('@/pages/plagiarism/PlagiarismPairDiffPage'));
const PlagiarismCorpusPage = lazy(() => import('@/pages/plagiarism/PlagiarismCorpusPage'));
const AnalysisListPage = lazy(() => import('@/pages/ai/AnalysisListPage'));
const SubmissionAIReportPage = lazy(() => import('@/pages/ai/SubmissionAIReportPage'));
const PromptVersionsPage = lazy(() => import('@/pages/admin/PromptVersionsPage'));
const LLMProvidersPage = lazy(() => import('@/pages/admin/LLMProvidersPage'));
const LLMBudgetsPage = lazy(() => import('@/pages/admin/LLMBudgetsPage'));
const LLMCacheAdminPage = lazy(() => import('@/pages/admin/LLMCacheAdminPage'));

// Course / assignment / submission pages.
const CoursesListPage = lazy(() => import('@/pages/courses/CoursesListPage'));
const CourseCreatePage = lazy(() => import('@/pages/courses/CourseCreatePage'));
const CourseDetailPage = lazy(() => import('@/pages/courses/CourseDetailPage'));
const JoinByCodePage = lazy(() => import('@/pages/courses/JoinByCodePage'));
const AssignmentDetailPage = lazy(() => import('@/pages/assignments/AssignmentDetailPage'));
const AssignmentCreatePage = lazy(() => import('@/pages/assignments/AssignmentCreatePage'));
const HomeworkCreatePage = lazy(() => import('@/pages/homeworks/HomeworkCreatePage'));
const HomeworkAssignmentCreatePage = lazy(() => import('@/pages/homeworks/HomeworkAssignmentCreatePage'));
const AssignmentSettingsPage = lazy(() => import('@/pages/assignments/AssignmentSettingsPage'));
const AssignmentSubmissionsPage = lazy(() => import('@/pages/assignments/AssignmentSubmissionsPage'));
const AssignmentDeadlinesPage = lazy(() => import('@/pages/assignments/AssignmentDeadlinesPage'));
const SubmissionDetailPage = lazy(() => import('@/pages/submissions/SubmissionDetailPage'));
const SubmissionUploadPage = lazy(() => import('@/pages/submissions/SubmissionUploadPage'));

// Dashboards / Reporting / Notifications.
const MyDashboardPage = lazy(() => import('@/pages/dashboard/MyDashboardPage'));
const TenantDashboardPage = lazy(() => import('@/pages/dashboard/TenantDashboardPage'));
const GlobalDashboardPage = lazy(() => import('@/pages/dashboard/GlobalDashboardPage'));
const ExportsListPage = lazy(() => import('@/pages/reporting/ExportsListPage'));
const ExportPage = lazy(() => import('@/pages/reporting/ExportPage'));
const NotificationCenterPage = lazy(() => import('@/pages/notifications/NotificationCenterPage'));
const PreferencesPage = lazy(() => import('@/pages/notifications/PreferencesPage'));
const WebPushSettingsPage = lazy(() => import('@/pages/notifications/WebPushSettingsPage'));

// Admin / Audit / Settings.
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage'));
const TenantsListPage = lazy(() => import('@/pages/admin/TenantsListPage'));
const TenantCreatePage = lazy(() => import('@/pages/admin/TenantCreatePage'));
const TenantDetailPage = lazy(() => import('@/pages/admin/TenantDetailPage'));
const UsersListPage = lazy(() => import('@/pages/admin/UsersListPage'));
const UserCreatePage = lazy(() => import('@/pages/admin/UserCreatePage'));
const UserDetailPage = lazy(() => import('@/pages/admin/UserDetailPage'));
const IntegrationsListPage = lazy(() => import('@/pages/admin/IntegrationsListPage'));
const OAuthProvidersPage = lazy(() => import('@/pages/admin/OAuthProvidersPage'));
const LoginProvidersPage = lazy(() => import('@/pages/admin/LoginProvidersPage'));
const IntegrationCreatePage = lazy(() => import('@/pages/admin/IntegrationCreatePage'));
const IntegrationDetailPage = lazy(() => import('@/pages/admin/IntegrationDetailPage'));
const YandexContestSetupPage = lazy(() => import('@/pages/integrations/YandexContestSetupPage'));
const StepikSetupPage = lazy(() => import('@/pages/integrations/StepikSetupPage'));
const EjudgeSetupPage = lazy(() => import('@/pages/integrations/EjudgeSetupPage'));
const IntegrationOAuthCallbackPage = lazy(() => import('@/pages/integrations/IntegrationOAuthCallbackPage'));
const GoogleSheetsSetupPage = lazy(() => import('@/pages/integrations/GoogleSheetsSetupPage'));
const WebhooksAdminPage = lazy(() => import('@/pages/admin/WebhooksAdminPage'));
const EmailConfigPage = lazy(() => import('@/pages/admin/EmailConfigPage'));
const NotificationTemplatesPage = lazy(() => import('@/pages/admin/NotificationTemplatesPage'));
const NotificationDeliveriesPage = lazy(() => import('@/pages/admin/NotificationDeliveriesPage'));
const NotificationDLQPage = lazy(() => import('@/pages/admin/NotificationDLQPage'));
const AuditEventsPage = lazy(() => import('@/pages/admin/audit/AuditEventsPage'));
const AuditSearchPage = lazy(() => import('@/pages/admin/audit/AuditSearchPage'));
const AuditByActorPage = lazy(() => import('@/pages/admin/audit/AuditByActorPage'));
const AuditByResourcePage = lazy(() => import('@/pages/admin/audit/AuditByResourcePage'));
const AuditAccessDeniedPage = lazy(() => import('@/pages/admin/audit/AuditAccessDeniedPage'));
const AuditRetentionPolicyPage = lazy(() => import('@/pages/admin/audit/AuditRetentionPolicyPage'));
const AuditLegalHoldPage = lazy(() => import('@/pages/admin/audit/AuditLegalHoldPage'));
const RolesPermissionsPage = lazy(() => import('@/pages/admin/settings/RolesPermissionsPage'));
const SystemHealthPage = lazy(() => import('@/pages/admin/settings/SystemHealthPage'));
const SystemSettingsPage = lazy(() => import('@/pages/admin/settings/SystemSettingsPage'));

/** Small wrapper for the unauth-shell pages so we don't repeat the
 *  Suspense fallback at each route element. The public chunks are
 *  tiny but they still need a `Suspense` parent — without it React
 *  throws when the lazy component suspends. */
function PublicChunk({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton width="narrow" />}>{children}</Suspense>;
}

/**
 * Tiny helper: an old ``/courses/:slug/<sub>`` URL used to render a
 * dedicated sub-page. The course detail page now hosts the surviving
 * tabs inline (?tab=members | stats), and the unused sub-pages are
 * dropped. This component grabs ``:slug`` from the URL and bounces to
 * the right ``?tab=`` (or the default tab) so old bookmarks land
 * somewhere sensible instead of 404.
 */
function RedirectToCourseTab({ tab }: { tab?: string }) {
  const { slug } = useParams<{ slug: string }>();
  const target = tab
    ? `/courses/${slug}?tab=${tab}`
    : `/courses/${slug}`;
  return <Navigate to={target} replace />;
}

/** /me/assignments/:id → /assignments/:id. Preserves the dynamic
 *  segment so the unified detail page renders the same assignment. */
function MyAssignmentRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/assignments/${id ?? ''}`} replace />;
}

const protectedRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRedirect /> },

      { path: 'me', element: <MyDashboardPage /> },
      { path: 'me/profile', element: <ProfilePage /> },
      // /me/security folded into /me/profile (one open document with
      // inline Безопасность). Old links / bookmarks redirect.
      { path: 'me/security', element: <Navigate to="/me/profile" replace /> },
      { path: 'me/api-keys', element: <MyApiKeysPage /> },
      { path: 'me/external-bindings', element: <MyExternalBindingsPage /> },
      // /me/assignments folded into /me (dashboard). Detail page stays —
      // it's where a click on a deadline lands. Same for /me/submissions:
      // the list view is part of the dashboard now, but the detail page
      // (with grade + feedback) keeps its own URL.
      { path: 'me/assignments', element: <Navigate to="/me" replace /> },
      // /me/assignments/:id was a separate (broken) student-view of the
      // assignment. Now the canonical detail page is /assignments/:id;
      // gate-by-role lives inside it so the student gets a stripped-down
      // version of the same page. Old links / breadcrumbs redirect.
      { path: 'me/assignments/:id', element: <MyAssignmentRedirect /> },
      { path: 'me/submissions', element: <Navigate to="/me" replace /> },
      { path: 'me/submissions/:id', element: <MySubmissionDetailPage /> },
      // /me/inbox → /notifications (canonical inbox URL is shared across roles).
      { path: 'me/inbox', element: <Navigate to="/notifications" replace /> },
      // /me/grades folded into the dashboard too.
      { path: 'me/grades', element: <Navigate to="/me" replace /> },
      // /me/settings rolled into /me/profile (one «настройки = профиль» surface).
      { path: 'me/settings', element: <Navigate to="/me/profile" replace /> },
      { path: 'me/2fa', element: <TwoFactorEnrollPage /> },
      { path: 'me/exports', element: <ExportsListPage mode="student" /> },
      {
        path: 'me/notifications/preferences',
        element: <PreferencesPage />,
      },
      {
        path: 'me/notifications/web-push',
        element: <WebPushSettingsPage />,
      },

      // Courses
      { path: 'courses', element: <CoursesListPage /> },
      { path: 'courses/new', element: <CourseCreatePage /> },
      { path: 'courses/join', element: <JoinByCodePage /> },
      { path: 'courses/join/:code', element: <JoinByCodePage /> },
      { path: 'courses/:slug', element: <CourseDetailPage /> },
      // Settings folded into inline editing on the course page; keep the
      // old path working for bookmarks by bouncing back to the course.
      { path: 'courses/:slug/settings', element: <Navigate to=".." replace /> },
      // ↓ All these sub-pages were folded into the course-page tabs (or
      //   dropped outright per the user's "всё убирай" call). Redirect
      //   any old bookmarks to the new tabbed surface.
      {
        path: 'courses/:slug/members',
        element: <RedirectToCourseTab tab="members" />,
      },
      {
        path: 'courses/:slug/stats',
        element: <RedirectToCourseTab tab="stats" />,
      },
      {
        // Dashboard was a near-duplicate of Stats — fold into it.
        path: 'courses/:slug/dashboard',
        element: <RedirectToCourseTab tab="stats" />,
      },
      { path: 'courses/:slug/groups', element: <RedirectToCourseTab /> },
      {
        path: 'courses/:slug/invitations',
        element: <RedirectToCourseTab />,
      },
      { path: 'courses/:slug/exports', element: <RedirectToCourseTab /> },
      {
        path: 'courses/:slug/scheduled-exports',
        element: <RedirectToCourseTab />,
      },
      {
        path: 'courses/:slug/google-sheets',
        element: <RedirectToCourseTab />,
      },
      {
        path: 'courses/:courseSlug/assignments/new',
        element: <AssignmentCreatePage />,
      },

      // Homeworks (under course)
      {
        path: 'courses/:slug/homeworks/new',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <HomeworkCreatePage />
          </RoleGuard>
        ),
      },
      {
        // Homework detail page was deleted — the inline-expand on
        // /courses and the «ДЗ» tab on /courses/:slug do the job. Old
        // bookmarks redirect to the course page.
        path: 'courses/:slug/homeworks/:hwSlug',
        element: <RedirectToCourseTab />,
      },
      {
        path: 'courses/:slug/homeworks/:hwSlug/assignments/new',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <HomeworkAssignmentCreatePage />
          </RoleGuard>
        ),
      },

      // Assignments
      { path: 'assignments/:id', element: <AssignmentDetailPage /> },
      { path: 'assignments/:id/settings', element: <AssignmentSettingsPage /> },
      {
        path: 'assignments/:id/submissions',
        element: <AssignmentSubmissionsPage />,
      },
      {
        path: 'assignments/:id/deadlines',
        element: <AssignmentDeadlinesPage />,
      },
      { path: 'assignments/:id/upload', element: <SubmissionUploadPage /> },

      // Submissions
      { path: 'submissions/:id', element: <SubmissionDetailPage /> },

      { path: 'grading', element: <GradingQueuePage /> },
      // «Экспорт» — grades-to-spreadsheet first, other report kinds
      // secondary. ExportsListPage stays the generic list for the student
      // (/me/exports) and admin (/admin/exports) routes below.
      { path: 'reports', element: <ExportPage /> },
      { path: 'notifications', element: <NotificationCenterPage /> },

      // ----- Top-level shortcuts to redesigned screens -----
      // ActivityLogPage calls `/api/v1/audit/events`, which requires
      // admin/super_admin server-side. Non-admin visits redirect home so
      // a stale sidebar link doesn't dead-end at a 404 page.
      {
        path: 'activity',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<Navigate to="/" replace />}
          >
            <ActivityLogPage />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <IntegrationsListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations/yandex-contest/setup',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <YandexContestSetupPage />
          </RoleGuard>
        ),
      },
      // /integrations/yandex-contest/:id/contests used to host a parallel
      // contest-binding UI; that flow now lives entirely on the course
      // detail page (CourseDetailPage → '+ Новое ДЗ' → 'Из Yandex.Contest').
      // Old bookmarks land on the integrations list.
      {
        path: 'integrations/yandex-contest/:configId/contests',
        element: <Navigate to="/integrations" replace />,
      },
      {
        path: 'integrations/stepik/setup',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <StepikSetupPage />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations/ejudge/setup',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <EjudgeSetupPage />
          </RoleGuard>
        ),
      },
      {
        // Tenant-level Google Sheets connection — admins paste a
        // Service Account JSON. Replaced/joined by per-teacher OAuth
        // (Iter 2) and per-teacher personal SA (Iter 3) below.
        path: 'integrations/google-sheets/setup',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <GoogleSheetsSetupPage mode="admin" />
          </RoleGuard>
        ),
      },
      {
        // Per-teacher Service Account upload (Iter 3). Open to any
        // teacher — their SA only sees the sheets they've shared with
        // it, so it's not a privilege grant.
        path: 'integrations/google-sheets/personal-setup',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <GoogleSheetsSetupPage mode="personal" />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations/oauth/callback',
        element: <IntegrationOAuthCallbackPage />,
      },
      // /integrations/wizard removed — replaced by an inline dropdown
      // on /integrations that either redirects to the provider's OAuth
      // page or opens a token-modal (TokenIntegrationDialog) for the
      // non-OAuth providers (eJudge / Manual ZIP). Old bookmarks land
      // on the list page.
      {
        path: 'integrations/wizard',
        element: <Navigate to="/integrations" replace />,
      },
      // Teacher-friendly aliases for the generic create wizard so the URL
      // doesn't carry the misleading `/admin/` prefix when a regular teacher
      // is doing the work.
      {
        path: 'integrations/new',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <IntegrationCreatePage />
          </RoleGuard>
        ),
      },
      // Teacher-friendly mirror of /admin/integrations/:id. Owners (teachers)
      // need to be able to inspect and tune their own integrations without
      // bouncing through an admin-only route. Backend already enforces the
      // tenant/owner check on the API, so we just open the page.
      // NB: keep AFTER /integrations/{stepik|ejudge|...}/setup so those
      // literal paths win the route match instead of being captured by `:id`.
      {
        path: 'integrations/:id',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <IntegrationDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'llm',
        // Backend `/api/v1/admin/ai/providers` requires admin/super_admin —
        // the page calls it on mount. Non-admin visits redirect home so a
        // stale sidebar link doesn't dead-end at a 404 page.
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<Navigate to="/" replace />}
          >
            <LLMProvidersPage />
          </RoleGuard>
        ),
      },
      // /settings was a dedicated landing page; consolidated into /me/profile
      // (one «настройки = профиль» surface). Bookmarks still work.
      { path: 'settings', element: <Navigate to="/me/profile" replace /> },

      // ----- Imports — consolidated into «Интеграции». Submission-import
      // no longer has its own nav item or page: the integration cards run
      // imports and the cross-integration job history lives on
      // /integrations. Old /imports links/bookmarks redirect there.
      { path: 'imports', element: <Navigate to="/integrations" replace /> },

      {
        path: 'admin',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <TenantDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/exports',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <ExportsListPage mode="admin" />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/dashboard/tenant/:id',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <TenantDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/dashboard/global',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <GlobalDashboardPage />
          </RoleGuard>
        ),
      },
      // ----- P5c admin overview -----
      {
        path: 'admin/overview',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AdminDashboardPage />
          </RoleGuard>
        ),
      },

      // ----- Tenants (super_admin) -----
      {
        path: 'admin/tenants',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <TenantsListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/tenants/new',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <TenantCreatePage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/tenants/:id',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <TenantDetailPage />
          </RoleGuard>
        ),
      },

      // ----- Users -----
      {
        path: 'admin/users',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <UsersListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/users/new',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <UserCreatePage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/users/:id',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <UserDetailPage />
          </RoleGuard>
        ),
      },

      // ----- Login providers (social sign-in OAuth) -----
      {
        path: 'admin/login-providers',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <LoginProvidersPage />
          </RoleGuard>
        ),
      },

      // ----- Integrations -----
      {
        path: 'admin/integrations',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <IntegrationsListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/integrations/new',
        element: (
          <RoleGuard
            global={['teacher', 'admin']}
            fallback={<NotFoundPage />}
          >
            <IntegrationCreatePage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/integrations/oauth-providers',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <OAuthProvidersPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/integrations/webhooks',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <WebhooksAdminPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/integrations/:id',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <IntegrationDetailPage />
          </RoleGuard>
        ),
      },

      // ----- Notifications admin -----
      {
        path: 'admin/notifications/email',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <EmailConfigPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/notifications/templates',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <NotificationTemplatesPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/notifications/deliveries',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <NotificationDeliveriesPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/notifications/dlq',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <NotificationDLQPage />
          </RoleGuard>
        ),
      },

      // ----- Audit -----
      {
        path: 'admin/audit',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditEventsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit/search',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditSearchPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit/actors/:userId',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditByActorPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit/resources/:type/:id',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditByResourcePage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit/access-denied',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditAccessDeniedPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit/retention',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditRetentionPolicyPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/audit/legal-holds',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <AuditLegalHoldPage />
          </RoleGuard>
        ),
      },

      // ----- Settings (P5c) -----
      {
        path: 'admin/roles',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <RolesPermissionsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/system/health',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <SystemHealthPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/system/settings',
        element: (
          <RoleGuard
            global={['admin']}
            fallback={<NotFoundPage />}
          >
            <SystemSettingsPage />
          </RoleGuard>
        ),
      },

      { path: 'admin/providers', element: <AdminProvidersPage /> },
      { path: 'admin/metrics', element: <AdminMetricsPage /> },
      {
        path: 'admin/settings',
        // Map "Настройки тенанта" to the existing tenant SystemSettings page.
        element: <Navigate to="/admin/system/settings" replace />,
      },

      // ----- Plagiarism -----
      {
        path: 'assignments/:assignmentId/plagiarism',
        element: (
          <RoleGuard global={['teacher', 'admin']} fallback={<NotFoundPage />}>
            <PlagiarismRunsListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'plagiarism-runs/:runId',
        element: (
          <RoleGuard global={['teacher', 'admin']} fallback={<NotFoundPage />}>
            <PlagiarismRunDetailPage />
          </RoleGuard>
        ),
      },
      {
        path: 'plagiarism-runs/:runId/pairs/:pairId',
        element: (
          <RoleGuard global={['teacher', 'admin']} fallback={<NotFoundPage />}>
            <PlagiarismPairDiffPage />
          </RoleGuard>
        ),
      },
      {
        // «Подозрительные» is back as a real course-page tab
        // (alongside ДЗ / Участники / Статистика). Old bookmarks land
        // on the tab so they keep working.
        path: 'courses/:slug/suspicious',
        element: <RedirectToCourseTab tab="suspicious" />,
      },
      {
        path: 'admin/plagiarism-corpus',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <PlagiarismCorpusPage />
          </RoleGuard>
        ),
      },

      // ----- AI Analysis -----
      {
        path: 'assignments/:assignmentId/ai-analyses',
        element: (
          <RoleGuard global={['teacher', 'admin']} fallback={<NotFoundPage />}>
            <AnalysisListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'submissions/:id/ai-report',
        element: (
          <RoleGuard global={['teacher', 'admin']} fallback={<NotFoundPage />}>
            <SubmissionAIReportPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/ai/prompt-versions',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <PromptVersionsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/ai/providers',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <LLMProvidersPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/ai/budgets',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <LLMBudgetsPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/ai/cache',
        element: (
          <RoleGuard global={['admin']} fallback={<NotFoundPage />}>
            <LLMCacheAdminPage />
          </RoleGuard>
        ),
      },

      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter([
  // Public auth pages.  LoginPage is eagerly imported so the cold-load
  // first paint doesn't need to wait on a chunk request; the rest are
  // lazy and need a <Suspense> parent (PublicChunk) because they sit
  // outside <AppShell />, which is where the protected Suspense lives.
  { path: '/login', element: <LoginPage />, errorElement: <ErrorPage /> },
  // /register is now a thin redirect — sign-up lives inside LoginPage.
  { path: '/register', element: <Navigate to="/login?mode=register" replace />, errorElement: <ErrorPage /> },
  // /auth/forgot is now a thin redirect — recovery lives inside LoginPage.
  { path: '/auth/forgot', element: <Navigate to="/login?mode=forgot" replace />, errorElement: <ErrorPage /> },
  { path: '/auth/reset', element: <PublicChunk><ResetPasswordPage /></PublicChunk>, errorElement: <ErrorPage /> },
  { path: '/auth/verify', element: <PublicChunk><VerifyEmailPage /></PublicChunk>, errorElement: <ErrorPage /> },
  {
    path: '/auth/oauth/callback',
    element: <PublicChunk><OAuthCallbackPage /></PublicChunk>,
    errorElement: <ErrorPage />,
  },
  { path: '/demo', element: <PublicChunk><DemoLoginPage /></PublicChunk>, errorElement: <ErrorPage /> },
  // Legacy alias
  { path: '/auth/login', element: <Navigate to="/login" replace /> },

  // Protected app
  {
    element: <ProtectedRoute />,
    errorElement: <ErrorPage />,
    children: protectedRoutes,
  },
]);
