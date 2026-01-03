/**
 * Application routes.
 *
 * Public:
 *   /login, /register, /auth/forgot, /auth/reset, /auth/verify, /auth/oauth/callback, /demo
 *
 * Protected (under <AppShell />):
 *   / → role-based redirect
 *   /me, /me/assignments, /me/submissions, /me/2fa, /me/settings
 *   /courses (placeholder)
 *   /grading (placeholder)
 *   /reports (placeholder)
 *   /notifications (placeholder)
 *   /admin/* (placeholder)
 *
 * Placeholders are filled in by later agents.
 */
import {
  createBrowserRouter,
  Navigate,
  RouteObject,
  useParams,
} from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { RoleGuard } from '@/auth/RoleGuard';
import { AppShell } from '@/layout/AppShell';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import VerifyEmailPage from '@/pages/auth/VerifyEmailPage';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';
import TwoFactorEnrollPage from '@/pages/auth/TwoFactorEnrollPage';
import DemoLoginPage from '@/pages/auth/DemoLoginPage';
import HomeRedirect from '@/pages/app/HomeRedirect';
import MyAssignmentsPage from '@/pages/me/MyAssignmentsPage';
import MyGradesPage from '@/pages/me/MyGradesPage';
import MySettingsPage from '@/pages/me/MySettingsPage';
import GradingQueuePage from '@/pages/teacher/GradingQueuePage';
import AdminProvidersPage from '@/pages/admin/AdminProvidersPage';
import AdminMetricsPage from '@/pages/admin/AdminMetricsPage';
import NotFoundPage from '@/pages/NotFoundPage';
import ErrorPage from '@/pages/ErrorPage';
import PlagiarismRunsListPage from '@/pages/plagiarism/PlagiarismRunsListPage';
import PlagiarismRunDetailPage from '@/pages/plagiarism/PlagiarismRunDetailPage';
import PlagiarismPairDiffPage from '@/pages/plagiarism/PlagiarismPairDiffPage';
import PlagiarismCorpusPage from '@/pages/plagiarism/PlagiarismCorpusPage';
import AnalysisListPage from '@/pages/ai/AnalysisListPage';
import SubmissionAIReportPage from '@/pages/ai/SubmissionAIReportPage';
import PromptVersionsPage from '@/pages/admin/PromptVersionsPage';
import LLMProvidersPage from '@/pages/admin/LLMProvidersPage';
import LLMBudgetsPage from '@/pages/admin/LLMBudgetsPage';
import LLMCacheAdminPage from '@/pages/admin/LLMCacheAdminPage';

// Course / assignment / submission pages
import CoursesListPage from '@/pages/courses/CoursesListPage';
import CourseCreatePage from '@/pages/courses/CourseCreatePage';
import CourseDetailPage from '@/pages/courses/CourseDetailPage';
import CourseSettingsPage from '@/pages/courses/CourseSettingsPage';
import JoinByCodePage from '@/pages/courses/JoinByCodePage';
import AssignmentDetailPage from '@/pages/assignments/AssignmentDetailPage';
import AssignmentCreatePage from '@/pages/assignments/AssignmentCreatePage';
import HomeworkCreatePage from '@/pages/homeworks/HomeworkCreatePage';
import HomeworkAssignmentCreatePage from '@/pages/homeworks/HomeworkAssignmentCreatePage';
import AssignmentSettingsPage from '@/pages/assignments/AssignmentSettingsPage';
import AssignmentSubmissionsPage from '@/pages/assignments/AssignmentSubmissionsPage';
import AssignmentDeadlinesPage from '@/pages/assignments/AssignmentDeadlinesPage';
import SubmissionDetailPage from '@/pages/submissions/SubmissionDetailPage';
import SubmissionUploadPage from '@/pages/submissions/SubmissionUploadPage';
import SubmissionsListPage from '@/pages/submissions/SubmissionsListPage';

// Dashboards / Reporting / Notifications
import MyDashboardPage from '@/pages/dashboard/MyDashboardPage';
import TenantDashboardPage from '@/pages/dashboard/TenantDashboardPage';
import GlobalDashboardPage from '@/pages/dashboard/GlobalDashboardPage';
import ExportsListPage from '@/pages/reporting/ExportsListPage';
import ExportPage from '@/pages/reporting/ExportPage';
import NotificationCenterPage from '@/pages/notifications/NotificationCenterPage';
import PreferencesPage from '@/pages/notifications/PreferencesPage';
import WebPushSettingsPage from '@/pages/notifications/WebPushSettingsPage';

// Admin / Audit / Profile / Settings (P5c).
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage';
import TenantsListPage from '@/pages/admin/TenantsListPage';
import TenantCreatePage from '@/pages/admin/TenantCreatePage';
import TenantDetailPage from '@/pages/admin/TenantDetailPage';
import UsersListPage from '@/pages/admin/UsersListPage';
import UserCreatePage from '@/pages/admin/UserCreatePage';
import UserDetailPage from '@/pages/admin/UserDetailPage';
import IntegrationsListPage from '@/pages/admin/IntegrationsListPage';
import OAuthProvidersPage from '@/pages/admin/OAuthProvidersPage';
import IntegrationCreatePage from '@/pages/admin/IntegrationCreatePage';
import IntegrationDetailPage from '@/pages/admin/IntegrationDetailPage';
import ImportWizardPage from '@/pages/integrations/ImportWizardPage';
import YandexContestSetupPage from '@/pages/integrations/YandexContestSetupPage';
import StepikSetupPage from '@/pages/integrations/StepikSetupPage';
import EjudgeSetupPage from '@/pages/integrations/EjudgeSetupPage';
import IntegrationOAuthCallbackPage from '@/pages/integrations/IntegrationOAuthCallbackPage';
import YandexContestImportPage from '@/pages/integrations/YandexContestImportPage';
import GoogleSheetsSetupPage from '@/pages/integrations/GoogleSheetsSetupPage';
import WebhooksAdminPage from '@/pages/admin/WebhooksAdminPage';
import EmailConfigPage from '@/pages/admin/EmailConfigPage';
import NotificationTemplatesPage from '@/pages/admin/NotificationTemplatesPage';
import NotificationDeliveriesPage from '@/pages/admin/NotificationDeliveriesPage';
import NotificationDLQPage from '@/pages/admin/NotificationDLQPage';
import AuditEventsPage from '@/pages/admin/audit/AuditEventsPage';
import AuditSearchPage from '@/pages/admin/audit/AuditSearchPage';
import AuditByActorPage from '@/pages/admin/audit/AuditByActorPage';
import AuditByResourcePage from '@/pages/admin/audit/AuditByResourcePage';
import AuditAccessDeniedPage from '@/pages/admin/audit/AuditAccessDeniedPage';
import AuditRetentionPolicyPage from '@/pages/admin/audit/AuditRetentionPolicyPage';
import AuditLegalHoldPage from '@/pages/admin/audit/AuditLegalHoldPage';
import RolesPermissionsPage from '@/pages/admin/settings/RolesPermissionsPage';
import SystemHealthPage from '@/pages/admin/settings/SystemHealthPage';
import SystemSettingsPage from '@/pages/admin/settings/SystemSettingsPage';
import ProfilePage from '@/pages/me/ProfilePage';
import SecurityPage from '@/pages/me/SecurityPage';
import MyApiKeysPage from '@/pages/me/MyApiKeysPage';
import MyExternalBindingsPage from '@/pages/me/MyExternalBindingsPage';
import MyAssignmentDetailPage from '@/pages/me/MyAssignmentDetailPage';
import MySubmissionDetailPage from '@/pages/me/MySubmissionDetailPage';
import ActivityLogPage from '@/pages/teacher/ActivityLogPage';
import UserSettingsLanding from '@/pages/me/UserSettingsLandingPage';

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

const protectedRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRedirect /> },

      { path: 'me', element: <MyDashboardPage /> },
      { path: 'me/profile', element: <ProfilePage /> },
      { path: 'me/security', element: <SecurityPage /> },
      { path: 'me/api-keys', element: <MyApiKeysPage /> },
      { path: 'me/external-bindings', element: <MyExternalBindingsPage /> },
      { path: 'me/assignments', element: <MyAssignmentsPage /> },
      { path: 'me/assignments/:id', element: <MyAssignmentDetailPage /> },
      { path: 'me/submissions', element: <SubmissionsListPage /> },
      { path: 'me/submissions/:id', element: <MySubmissionDetailPage /> },
      // /me/inbox → /notifications (canonical inbox URL is shared across roles).
      { path: 'me/inbox', element: <Navigate to="/notifications" replace /> },
      { path: 'me/grades', element: <MyGradesPage /> },
      { path: 'me/settings', element: <MySettingsPage /> },
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
      { path: 'courses/:slug/settings', element: <CourseSettingsPage /> },
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
            global={['teacher', 'admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
            fallback={<NotFoundPage />}
          >
            <YandexContestSetupPage />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations/yandex-contest/:configId/contests',
        element: (
          <RoleGuard
            global={['teacher', 'admin', 'super_admin']}
            fallback={<NotFoundPage />}
          >
            <YandexContestImportPage />
          </RoleGuard>
        ),
      },
      {
        path: 'integrations/stepik/setup',
        element: (
          <RoleGuard
            global={['teacher', 'admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
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
      // 4-step guided wizard (was /imports until we split that surface into
      // "run-import" vs "set up integration"). Same component, new route.
      {
        path: 'integrations/wizard',
        element: (
          <RoleGuard
            global={['teacher', 'admin', 'super_admin']}
            fallback={<NotFoundPage />}
          >
            <ImportWizardPage />
          </RoleGuard>
        ),
      },
      // Teacher-friendly aliases for the generic create wizard so the URL
      // doesn't carry the misleading `/admin/` prefix when a regular teacher
      // is doing the work.
      {
        path: 'integrations/new',
        element: (
          <RoleGuard
            global={['teacher', 'admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
            fallback={<Navigate to="/" replace />}
          >
            <LLMProvidersPage />
          </RoleGuard>
        ),
      },
      { path: 'settings', element: <UserSettingsLanding /> },

      // ----- Imports — consolidated into «Интеграции». Submission-import
      // no longer has its own nav item or page: the integration cards run
      // imports and the cross-integration job history lives on
      // /integrations. Old /imports links/bookmarks redirect there.
      { path: 'imports', element: <Navigate to="/integrations" replace /> },

      {
        path: 'admin',
        element: (
          <RoleGuard
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
            fallback={<NotFoundPage />}
          >
            <TenantDashboardPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/dashboard/global',
        element: (
          <RoleGuard global={['super_admin']} fallback={<NotFoundPage />}>
            <GlobalDashboardPage />
          </RoleGuard>
        ),
      },
      // ----- P5c admin overview -----
      {
        path: 'admin/overview',
        element: (
          <RoleGuard
            global={['admin', 'super_admin']}
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
          <RoleGuard global={['super_admin']} fallback={<NotFoundPage />}>
            <TenantsListPage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/tenants/new',
        element: (
          <RoleGuard global={['super_admin']} fallback={<NotFoundPage />}>
            <TenantCreatePage />
          </RoleGuard>
        ),
      },
      {
        path: 'admin/tenants/:id',
        element: (
          <RoleGuard global={['super_admin']} fallback={<NotFoundPage />}>
            <TenantDetailPage />
          </RoleGuard>
        ),
      },

      // ----- Users -----
      {
        path: 'admin/users',
        element: (
          <RoleGuard
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
            fallback={<NotFoundPage />}
          >
            <UserDetailPage />
          </RoleGuard>
        ),
      },

      // ----- Integrations -----
      {
        path: 'admin/integrations',
        element: (
          <RoleGuard
            global={['admin', 'super_admin']}
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
            global={['teacher', 'admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
            global={['admin', 'super_admin']}
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
  // Public auth pages
  { path: '/login', element: <LoginPage />, errorElement: <ErrorPage /> },
  { path: '/register', element: <RegisterPage />, errorElement: <ErrorPage /> },
  { path: '/auth/forgot', element: <ForgotPasswordPage />, errorElement: <ErrorPage /> },
  { path: '/auth/reset', element: <ResetPasswordPage />, errorElement: <ErrorPage /> },
  { path: '/auth/verify', element: <VerifyEmailPage />, errorElement: <ErrorPage /> },
  {
    path: '/auth/oauth/callback',
    element: <OAuthCallbackPage />,
    errorElement: <ErrorPage />,
  },
  { path: '/demo', element: <DemoLoginPage />, errorElement: <ErrorPage /> },
  // Legacy alias
  { path: '/auth/login', element: <Navigate to="/login" replace /> },

  // Protected app
  {
    element: <ProtectedRoute />,
    errorElement: <ErrorPage />,
    children: protectedRoutes,
  },
]);
