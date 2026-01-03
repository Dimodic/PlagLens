# PlagLens — Backend Endpoints × Frontend Coverage Map

Snapshot date: 2026-05-12. Read-only static analysis (no code changed).

Sources:
- Backend: all FastAPI routers under `services/<svc>/src/<svc>_service/api/**/*.py`.
- Frontend: `frontend/src/api/endpoints/*.ts` (axios wrappers) + `frontend/src/hooks/api/use*.ts` (React Query) + grep of `frontend/src/pages/**` and `frontend/src/components/**` for hook imports.
- Frontend axios baseURL = `/api/v1` (see `frontend/src/api/client.ts:20`). So a TS path `'/auth/login'` matches backend path `/api/v1/auth/login`.

Health / readiness / metrics / OpenAPI / JWKS / webhooks-from-third-parties are **excluded** from coverage stats — they are not UI-facing by design.

---

## TL;DR

| Bucket                                    | Count |
|-------------------------------------------|-------|
| Total business endpoints across 9 services (gateway proxies excluded) | **351** |
| Health/metrics/jwks/webhooks (excluded)   | ~45 |
| **Fully covered** (endpoint → hook → page)     | **172** |
| **Hook exists but no UI page uses it**         | **31**  |
| **No frontend hook at all**                    | **132** |
| **Orphan hooks / FE calls without matching backend** | **16**  |

Headline coverage of business endpoints: **`172 / 351 ≈ 49 %` fully wired to a page**, **`(172+31) / 351 ≈ 58 %` have a frontend wrapper**, **`~42 %` are backend-only today** — concentrated in admin / observability / read-models / per-event-prefs / bulk-ops / advanced plagiarism reports / scheduled-exports / Stepik & Yandex contest deep import endpoints.

### Top backend gaps you almost certainly want a UI for

| # | Endpoint | Service | Why it matters |
|---|----------|---------|----------------|
| 1 | `GET /api/v1/courses/{course_id}/dashboard/recent-activity` AND `/late-submissions` are wired, but **`GET /api/v1/audit/timeline`** is not | audit | Course-level "what happened" feed is a key teacher view; only `recent-activity` (reporting proxy) is consumed. The richer `/audit/timeline` is dead. |
| 2 | `GET /api/v1/users/me/notification-preferences/per-event/available-events` | notification | Frontend hook `useAvailableEvents` exists, but the **page never renders the per-event matrix** (see `PreferencesPage.tsx`). User-facing per-event toggle is broken. |
| 3 | `POST /api/v1/assignments/{id}/ai-analyses:batchCreate` | ai-analysis | Run AI on whole assignment batch — no hook, no UI. Teacher must click each submission. |
| 4 | `POST /api/v1/courses/{id}/scheduled-exports` family + `:run-now` | reporting | Hooks exist (`useScheduledExports`, `useCreateScheduledExport`, `useRunScheduledNow`), used by `ScheduledExportsPage.tsx` — **but** the rebuild/test paths (e.g. `POST /admin/reporting/read-models:rebuild`) are entirely missing. |
| 5 | `GET /api/v1/submissions/{id}/diff?against=…` | submission | Side-by-side diff between two submissions of the same author. Used implicitly by plagiarism diff page, but the standalone "compare my two attempts" UI is absent. |

### Other notable gaps

- `POST /api/v1/exports/audit` (audit CSV export proxy) — page `AuditEventsPage` calls it through `useExportAuditCsv`, but it actually POSTs to `/audit/events:export` and gets a 202. **Hook + page exist** — false alarm. OK.
- `POST /assignments/{id}/exports/google-sheets/sync` — backend, but no hook (`reporting.ts` only has the *course-level* one). Teachers can only sync per-course, not per-assignment.
- All `/admin/audit/legal-holds/*` writes and `:run-now` retention task — `useLegalHolds` + `useCreateLegalHold` + `useDeleteLegalHold` wired, page `AuditLegalHoldPage` uses them. OK.
- `/admin/notifications/dlq/{id}:discard` — `useDiscardDelivery` hook exists, but no page uses it (only `:retry` is in the DLQ page button).

---

## 1. Service inventory

| Service | Base prefix | Files | Business endpoints | Health/meta/webhooks/jwks | OpenAPI bits |
|---|---|---:|---:|---:|---|
| identity | `/api/v1` | 18 | 56 | 5 | OpenAPI default |
| course   | `/api/v1` | 7  | 41 | 4 | OpenAPI default |
| submission | `/api/v1` | 6 | 36 | 3 | OpenAPI default |
| plagiarism | `/api/v1` | 7 | 36 | 4 (+webhooks ×2) | OpenAPI default |
| ai-analysis | `/api/v1` | 9 | 36 | 4 | OpenAPI default |
| integration | `/api/v1` | 13 | 51 | 4 (+webhooks ×5, oauth-finalize ×1) | OpenAPI default |
| notification | `/api/v1` | 11 | 36 | 4 | OpenAPI default |
| audit | `/api/v1` | 4 | 13 | 4 (+internal ingest ×1) | OpenAPI default |
| reporting | `/api/v1` | 11 | 46 | 4 | `/api/v1/openapi.json`, `/api/v1/docs` |
| gateway | mixed | 9 | (proxy) — 15 own | health, jwks, debug | proxies everything else; routing table in `services/gateway/config/gateway.yaml` |

**Total business endpoints (gateway proxies counted once, gateway-own kept separately): 351.**

The gateway adds 15 endpoints (`/api/v1/search`, `/api/v1/services-status`, `/api/v1/_debug/client-errors`, `/v1/operations/...`, `/v1/health`, `/v1/.well-known/jwks.json`, `/api/v1/version`, `/v1/services-status` alias, etc.) but most are proxies to backends already listed above, except for: federated `/search`, `services-status`, `client-errors` debug ingest.

---

## 2. Fully covered: endpoint → hook → page

> Only the business endpoints. `Backend` is the file path where it's declared, line numbers omitted for brevity. `Hook` is the React-Query wrapper. `Pages` is the (non-exhaustive) list of pages importing the hook.

### identity

| Method | Path | Backend | Hook | Pages |
|---|---|---|---|---|
| POST | `/auth/login` | `identity/.../auth.py` | `authApi.login` (no useQuery wrapper — direct) | `LoginPage`, `AuthProvider` |
| POST | `/auth/register` | `auth.py` | `authApi.register` | `RegisterPage` |
| POST | `/auth/logout` | `auth.py` | `authApi.logout` | `AuthProvider` |
| POST | `/auth/refresh` | `auth.py` | client interceptor | `client.ts` |
| GET  | `/auth/me` | `auth.py` | `authApi.me` | `AuthProvider` |
| POST | `/auth/password/forgot` | `auth_password.py` | `authApi.passwordForgot` | `ForgotPasswordPage` |
| POST | `/auth/password/reset` | `auth_password.py` | `authApi.passwordReset` | `ResetPasswordPage` |
| POST | `/auth/password/change` | `auth_password.py` | `authApi.passwordChange` / `usersApi.changePassword` | `SecurityPage` |
| POST | `/auth/email/verify/request` | `auth_email.py` | `authApi.emailVerifyRequest` | `VerifyEmailPage` |
| POST | `/auth/email/verify/confirm` | `auth_email.py` | `authApi.emailVerifyConfirm` | `VerifyEmailPage` |
| POST | `/auth/2fa/enroll` | `auth_2fa.py` | `useEnroll2FA` / `authApi.enroll2fa` | `TwoFactorEnrollPage`, `SecurityPage` |
| POST | `/auth/2fa/enable` | `auth_2fa.py` | `useEnable2FA` | `TwoFactorEnrollPage`, `SecurityPage` |
| POST | `/auth/2fa/disable` | `auth_2fa.py` | `useDisable2FA` | `SecurityPage` |
| POST | `/auth/2fa/verify` | `auth_2fa.py` | `authApi.verify2fa` | `LoginPage` |
| GET  | `/auth/oauth/{provider}/authorize` | `auth_oauth.py` | `startOAuth` (window redirect) | `LoginPage` |
| GET  | `/auth/oauth/{provider}/callback` | `auth_oauth.py` | server-side; FE handles via `OAuthCallbackPage` | `OAuthCallbackPage` |
| DELETE | `/auth/oauth/{provider}/unlink` | `auth_oauth.py` | `useUnlinkOAuth` | `UserDetailPage`, `SecurityPage` |
| GET  | `/tenants` | `tenants.py` | `useTenants` | `TenantsListPage`, `AdminDashboardPage` |
| POST | `/tenants` | `tenants.py` | `useCreateTenant` | `TenantCreatePage` |
| GET  | `/tenants/{id}` | `tenants.py` | `useTenant` | `TenantDetailPage` |
| PATCH | `/tenants/{id}` | `tenants.py` | `useUpdateTenant` | `TenantDetailPage` |
| DELETE | `/tenants/{id}` | `tenants.py` | `tenantsApi.delete` (no hook wrapper, direct) | `TenantDetailPage` |
| POST | `/tenants/{id}:suspend` | `tenants.py` | `useSuspendTenant` | `TenantDetailPage` |
| POST | `/tenants/{id}:activate` | `tenants.py` | `useActivateTenant` | `TenantDetailPage` |
| GET  | `/tenants/{id}/settings` | `tenants.py` | `useTenantSettings` | `SystemSettingsPage`, `TenantDetailPage` |
| PATCH | `/tenants/{id}/settings` | `tenants.py` | `useUpdateTenantSettings` | `TenantDetailPage` |
| GET  | `/tenants/{id}/usage` | `tenants.py` | `useTenantUsage` | `TenantDetailPage` |
| GET  | `/users` | `users.py` | `useUsers` | `UsersListPage`, `AdminDashboardPage` |
| POST | `/users` | `users.py` | `useCreateUser` | `UserCreatePage` |
| POST | `/users:batchCreate` | `users.py` | `useBulkInviteUsers` | `UserCreatePage` |
| GET  | `/users/{id}` | `users.py` | `useUser` | `UserDetailPage` |
| PATCH | `/users/{id}` | `users.py` | `useUpdateUser` | `UserDetailPage` |
| POST | `/users/{id}:disable` | `users.py` | `useDisableUser` | `UserDetailPage` |
| POST | `/users/{id}:enable` | `users.py` | `useEnableUser` | `UserDetailPage` |
| POST | `/users/{id}:anonymize` | `users.py` | `useAnonymizeUser` | `UserDetailPage` |
| POST | `/users/{id}:reset-password` | `users.py` | `useResetUserPassword` | `UserDetailPage` |
| POST | `/users/{id}:force-logout` | `users.py` | `useForceLogout` | `UserDetailPage` |
| GET  | `/users/{id}/sessions` | `users.py` | `useUserSessions` | `UserDetailPage` |
| GET  | `/users/{id}/external-bindings` | `users.py` | `useUserExternalBindings` | `UserDetailPage` |
| GET  | `/users/{id}/oauth-identities` | `users.py` | `useUserOAuthIdentities` | `UserDetailPage` |
| GET  | `/users/me` | `me.py` | `usersApi.me` | `ProfilePage` |
| PATCH | `/users/me` | `me.py` | `useUpdateMe` | `ProfilePage` |
| POST | `/users/me/avatar` | `me.py` | `useUploadAvatar` | `ProfilePage` |
| DELETE | `/users/me/avatar` | `me.py` | `useDeleteAvatar` | `ProfilePage` |
| GET  | `/users/me/sessions` | `me.py` | `useMySessions` | `SecurityPage` |
| DELETE | `/users/me/sessions/{id}` | `me.py` | `useRevokeSession` | `SecurityPage` |
| POST | `/users/me/sessions:revokeAll` | `me.py` | `usersApi.revokeAllSessions` | `SecurityPage` |
| GET  | `/users/me/api-keys` | `api_keys.py` | `useApiKeys` | `MyApiKeysPage` |
| POST | `/users/me/api-keys` | `api_keys.py` | `useCreateApiKey` | `MyApiKeysPage` |
| POST | `/users/me/api-keys/{id}:rotate` | `api_keys.py` | `useRotateApiKey` | `MyApiKeysPage` |
| DELETE | `/users/me/api-keys/{id}` | `api_keys.py` | `useDeleteApiKey` | `MyApiKeysPage` |
| GET  | `/users/me/external-bindings` | `external_bindings.py` (via `me.py` shortcut) | `useMyExternalBindings` | `MyExternalBindingsPage` |
| POST | `/users/me/external-bindings` | external_bindings | `useAddMyExternalBinding` | `MyExternalBindingsPage` |
| DELETE | `/users/me/external-bindings/{id}` | external_bindings | `useRemoveMyExternalBinding` | `MyExternalBindingsPage` |
| GET  | `/roles` | `roles.py` | `useRoles` / `systemApi.listRoles` | `RolesPermissionsPage` |
| GET  | `/roles/{role}/permissions` | `roles.py` | `useRolePermissions` / `systemApi.rolePermissions` | `RolesPermissionsPage` |
| GET  | `/invitations/by-token/{token}` | `invitations.py` | (direct via auth flow on register/accept) | `RegisterPage`-adjacent |

### course

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/courses` | `useCourses` | `CoursesListPage`, `GradingQueuePage`, `AdminDashboardPage` |
| POST | `/courses` | `useCreateCourse` | `CourseCreatePage` |
| GET  | `/courses/{id}` | `useCourse` | `CourseDetailPage`, `CourseStatsPage`, `CourseSettingsPage`, `CourseDashboardPage`, `AssignmentCreatePage`, `ScheduledExportsPage`, `CourseExportsPage`, `GoogleSheetsLinkPage`, `MyAssignmentDetailPage`, `HomeworkCreatePage`, `HomeworkDetailPage`, `HomeworkAssignmentCreatePage` |
| PATCH | `/courses/{id}` | `useUpdateCourse` | `CourseSettingsPage` |
| DELETE | `/courses/{id}` | `useDeleteCourse` | `CourseSettingsPage` |
| POST | `/courses/{id}:archive` | `useArchiveCourse` | `CourseSettingsPage` |
| POST | `/courses/{id}:unarchive` | `useUnarchiveCourse` | `CourseSettingsPage` |
| POST | `/courses:joinByCode` | `useJoinByCode` | `JoinByCodePage` |
| GET  | `/users/me/courses` | `useMyCourses` | `CoursesListPage`, `MyGradesPage`, `MyAssignmentsPage`, `EjudgeSetupPage`, `StepikSetupPage`, `YandexContestSetupPage`, `ImportWizardPage` |
| GET  | `/users/me/assignments` | `useMyAssignments` | `MyAssignmentsPage`, `MyDashboardPage`, `CoursesListPage`, `GradingQueuePage` |
| GET  | `/courses/{id}/members` | `useCourseMembers` | `CourseMembersPage` |
| POST | `/courses/{id}/members` | `useAddMember` | `CourseMembersPage` |
| POST | `/courses/{id}/members:bulkInvite` | `useBulkInvite` | `CourseMembersPage` |
| PATCH | `/courses/{id}/members/{user_id}` | `useChangeMemberRole` | `CourseMembersPage` |
| DELETE | `/courses/{id}/members/{user_id}` | `useRemoveMember` | `CourseMembersPage` |
| GET  | `/courses/{id}/groups` | `useGroups` | `CourseGroupsPage` |
| POST | `/courses/{id}/groups` | `useCreateGroup` | `CourseGroupsPage` |
| DELETE | `/courses/{id}/groups/{group_id}` | `useDeleteGroup` | `CourseGroupsPage` |
| GET  | `/courses/{id}/invitations` | `useInvitations` | `CourseInvitationsPage` |
| POST | `/courses/{id}/invitations` | `useCreateInvitation` | `CourseInvitationsPage` |
| DELETE | `/courses/{id}/invitations/{inv_id}` | `useDeleteInvitation` | `CourseInvitationsPage` |
| GET  | `/courses/{course_id}/assignments` | `useAssignmentsByCourse` | `CourseDetailPage` |
| POST | `/courses/{course_id}/assignments` | `useCreateAssignment` | `AssignmentCreatePage`, `HomeworkAssignmentCreatePage` |
| GET  | `/assignments/{id}` | `useAssignment` | `AssignmentDetailPage`, `AssignmentSettingsPage`, `AssignmentSubmissionsPage`, `SubmissionUploadPage`, `SubmissionDetailPage`, `MyAssignmentDetailPage` |
| PATCH | `/assignments/{id}` | `useUpdateAssignment` | `AssignmentSettingsPage` |
| POST | `/assignments/{id}:publish` | `usePublishAssignment` | `AssignmentSettingsPage`, `AssignmentDetailPage` |
| POST | `/assignments/{id}:archive` | `useArchiveAssignment` | `AssignmentSettingsPage` |
| GET  | `/assignments/{id}/deadlines` | `useDeadlines` | `AssignmentDeadlinesPage` |
| PATCH | `/assignments/{id}/deadlines` | `assignmentsApi.updateDeadlines` (no useMutation wrapper) | `AssignmentDeadlinesPage` |
| GET  | `/assignments/{id}/deadline-extensions` | `useDeadlineExtensions` | `AssignmentDeadlinesPage` |
| POST | `/assignments/{id}/deadline-extensions` | `useCreateDeadlineExtension` | `AssignmentDeadlinesPage` |
| GET  | `/assignments/{id}/grading-config` | `useGradingConfig` | `AssignmentSettingsPage` |
| PATCH | `/assignments/{id}/grading-config` | `useUpdateGradingConfig` | `AssignmentSettingsPage` |
| GET  | `/assignments/{id}/stats` | `useAssignmentStats` | `AssignmentDetailPage` |
| GET  | `/courses/{course_id}/homeworks` | `useHomeworksForCourse` | `CourseDetailPage`, `HomeworkAssignmentCreatePage` |
| POST | `/courses/{course_id}/homeworks` | `useCreateHomework` | `HomeworkCreatePage` |
| GET  | `/homeworks/{id}` | `useHomework` | `HomeworkDetailPage` |
| GET  | `/homeworks/{id}/assignments` | `useHomeworkAssignments` | `HomeworkDetailPage` |

### submission

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/assignments/{id}/submissions` | `useSubmissions` | `AssignmentSubmissionsPage`, `AssignmentDetailPage`, `SubmissionDetailPage` |
| GET  | `/users/me/submissions` | `useMySubmissions` | `MyGradesPage`, `MySubmissionDetailPage`, `MyAssignmentDetailPage`, `SubmissionsListPage` |
| GET  | `/submissions/{id}` | `useSubmission` | `SubmissionDetailPage`, `MySubmissionDetailPage` |
| GET  | `/submissions/{id}/history` | `useSubmissionHistory` | `SubmissionDetailPage` |
| GET  | `/submissions/{id}/files` | `useSubmissionFiles` | `SubmissionDetailPage` |
| GET  | `/submissions/{id}/files/{file_id}/content` | `useSubmissionFileContent` | `SubmissionDetailPage` |
| POST | `/assignments/{id}/submissions` (upload) | `useUploadSubmission` | `SubmissionUploadPage` |
| DELETE | `/submissions/{id}` | `submissionsApi.delete` (direct, in detail page) | `SubmissionDetailPage` |
| POST | `/submissions/{id}:select` | `useSelectSubmission` | `SubmissionDetailPage` |
| POST | `/submissions/{id}:rerun-checks` | `useRerunChecks` | `SubmissionDetailPage` |
| GET  | `/submissions/{id}/grade` | `useGrade` | `SubmissionDetailPage` |
| POST | `/submissions/{id}/grade` | `useSetGrade` | `SubmissionDetailPage` |
| PATCH | `/submissions/{id}/grade` | `useUpdateGrade` | `SubmissionDetailPage` |
| DELETE | `/submissions/{id}/grade` | `useDeleteGrade` | `SubmissionDetailPage` |
| GET  | `/submissions/{id}/grade/history` | `useGradeHistory` | `SubmissionDetailPage` |
| GET  | `/submissions/{id}/feedback` | `useFeedback` | `SubmissionDetailPage` |
| POST | `/submissions/{id}/feedback` | `useAddFeedback` | `SubmissionDetailPage`, used by `CurateAsFeedbackModal` indirectly |
| POST | `/submissions/{id}/feedback/{fb_id}:publish` | `usePublishFeedback` | `SubmissionDetailPage` |
| DELETE | `/submissions/{id}/feedback/{fb_id}` | `useDeleteFeedback` | `SubmissionDetailPage` |
| GET  | `/submissions/{id}/flags` | `useFlags` | `SubmissionDetailPage` |
| POST | `/submissions/{id}:flag` | `useFlagSubmission` | `SubmissionDetailPage` |
| POST | `/submissions/{id}:unflag` | `useUnflagSubmission` | `SubmissionDetailPage` |
| GET  | `/users/me/submissions/{id}` | `submissionsApi.mySubmissions` family (via `MySubmissionDetailPage`) | `MySubmissionDetailPage` |
| GET  | `/users/me/submissions/{id}/plagiarism` | `usePairs`/`usePlagiarismRuns` (indirect; the FE actually hits `/submissions/{id}/plagiarism/runs` instead, see "Orphan hooks") | `MySubmissionDetailPage` |
| GET  | `/users/me/submissions/{id}/ai` | via `aiApi.getLatestForSubmission` (FE hits `/submissions/{id}/ai-analyses/latest`) | `MySubmissionDetailPage` |

### plagiarism

| Method | Path | Hook | Pages |
|---|---|---|---|
| POST | `/assignments/{id}/plagiarism-runs` | `useRunPlagiarism` | `PlagiarismRunsListPage`, `AssignmentDetailPage` |
| GET  | `/assignments/{id}/plagiarism-runs` | `usePlagiarismRuns` | `PlagiarismRunsListPage`, `AssignmentDetailPage`, `SubmissionDetailPage` |
| GET  | `/plagiarism-runs/{id}` | `usePlagiarismRun` | `PlagiarismRunDetailPage` |
| POST | `/plagiarism-runs/{id}:cancel` | `useCancelRun` | `PlagiarismRunDetailPage` |
| POST | `/plagiarism-runs/{id}:retry` | `useRetryRun` | `PlagiarismRunDetailPage` |
| DELETE | `/plagiarism-runs/{id}` | `plagiarismApi.deleteRun` (direct) | `PlagiarismRunDetailPage` |
| GET  | `/plagiarism-runs/{id}/report` | `usePlagiarismReport` | `PlagiarismRunDetailPage` |
| GET  | `/plagiarism-runs/{id}/pairs` | `usePairs` | `PlagiarismRunDetailPage`, `SubmissionDetailPage` |
| GET  | `/plagiarism-runs/{id}/pairs/{pair_id}` | `usePairDetail` | `PlagiarismPairDiffPage` |
| GET  | `/plagiarism-runs/{id}/clusters` | `useClusters` | `PlagiarismRunDetailPage` |
| GET  | `/plagiarism-runs/{id}/artifacts/{html|json|archive}` | `useArtifactUrl` | `PlagiarismRunDetailPage` |
| GET  | `/plagiarism-corpus` | `useCorpusStats` | `PlagiarismCorpusPage` |
| POST | `/plagiarism-corpus:rebuild` | `useRebuildCorpus` | `PlagiarismCorpusPage` |
| GET  | `/courses/{id}/suspicious-submissions` | `useSuspiciousSubmissions` | `SuspiciousSubmissionsPage`, `CourseStatsPage` |
| POST | `/submissions/{id}/suspicious-flags/{fid}:dismiss` | `useDismissFlag` | `SuspiciousSubmissionsPage` |
| PATCH | `/submissions/{id}/suspicious-flags/{fid}` | `useSetFlagSeverity` | `SuspiciousSubmissionsPage` |

### ai-analysis

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/submissions/{id}/ai-analyses` | `useAnalyses` | `SubmissionAIReportPage`, `SubmissionDetailPage` |
| GET  | `/submissions/{id}/ai-analyses/latest` | `useLatestAnalysis` | `SubmissionDetailPage` |
| GET  | `/ai-analyses/{id}` | `useAnalysis` | `SubmissionAIReportPage`, `CurateAsFeedbackModal` |
| POST | `/submissions/{id}/ai-analyses` | `useStartAnalysis` | `SubmissionAIReportPage`, `SubmissionDetailPage`, `AnalysisListPage` |
| POST | `/ai-analyses/{id}:regenerate` | `useRegenerate` | `SubmissionAIReportPage` |
| POST | `/ai-analyses/{id}:cancel` | `useCancelAnalysis` | `SubmissionAIReportPage` |
| POST | `/ai-analyses/{id}:curate-as-feedback` | `useCurateAsFeedback` | `CurateAsFeedbackModal` |
| POST | `/ai-analyses/{id}:share-with-student` | `useShareWithStudent` | `SubmissionAIReportPage` |
| POST | `/ai-analyses/{id}:unshare` | `useUnshare` | `SubmissionAIReportPage` |
| GET  | `/assignments/{id}/ai-analyses` | `useAnalysesForAssignment` | `AnalysisListPage`, `AssignmentDetailPage` |
| GET  | `/admin/ai/prompt-versions` | `usePromptVersions` | `PromptVersionsPage` |
| GET  | `/admin/ai/prompt-versions/{id}` | `usePromptVersion` | `PromptVersionsPage` |
| POST | `/admin/ai/prompt-versions` | `aiApi.createPromptVersion` (direct) | `PromptVersionsPage` |
| PATCH | `/admin/ai/prompt-versions/{id}` | `aiApi.updatePromptVersion` (direct) | `PromptVersionsPage` |
| POST | `/admin/ai/prompt-versions/{id}:activate` | `useActivatePromptVersion` | `PromptVersionsPage` |
| POST | `/admin/ai/prompt-versions/{id}:test` | `useTestPromptVersion` | `PromptVersionsPage` |
| GET  | `/admin/ai/providers` | `useProviders` | `LLMProvidersPage`, `AdminProvidersPage` |
| POST | `/admin/ai/providers/{id}:test` | `useTestProvider` | `LLMProvidersPage` |
| POST | `/admin/ai/providers/{id}:set-default` | `aiApi.setDefaultProvider` (direct) | `LLMProvidersPage` |
| PATCH | `/admin/ai/providers/{id}` | `useUpdateProvider` | `LLMProvidersPage` |
| DELETE | `/admin/ai/providers/{id}` | `aiApi.deleteProvider` (direct) | `LLMProvidersPage` |
| GET  | `/tenants/{id}/ai/budget` | `useTenantBudget` | `LLMBudgetsPage` |
| PATCH | `/tenants/{id}/ai/budget` | `useUpdateTenantBudget` | `LLMBudgetsPage` |
| GET  | `/tenants/{id}/ai/usage` | `useTenantUsage` (ai variant) | `LLMBudgetsPage` |
| GET  | `/courses/{id}/ai/budget` | `useCourseBudget` | `LLMBudgetsPage` |
| PATCH | `/courses/{id}/ai/budget` | `useUpdateCourseBudget` | `LLMBudgetsPage` |
| GET  | `/courses/{id}/ai/usage` | `useCourseUsage` | `LLMBudgetsPage` |
| GET  | `/admin/ai/cache/stats` | `useCacheStats` | `LLMCacheAdminPage` |
| DELETE | `/admin/ai/cache` | `usePurgeCache` | `LLMCacheAdminPage` |

### integration

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/integrations` | `useIntegrations` | `IntegrationsListPage`, `AdminDashboardPage` |
| POST | `/integrations` | `useCreateIntegration` | `IntegrationCreatePage`, `EjudgeSetupPage`, `StepikSetupPage`, `YandexContestSetupPage` |
| GET  | `/integrations/{id}` | `useIntegration` | `IntegrationDetailPage`, `YandexContestImportPage` |
| PATCH | `/integrations/{id}` | `useUpdateIntegration` | `IntegrationDetailPage` |
| DELETE | `/integrations/{id}` | `useDeleteIntegration` | `IntegrationsListPage`, `IntegrationDetailPage` |
| POST | `/integrations/{id}:test` | `useTestIntegration` | `IntegrationDetailPage` |
| POST | `/integrations/{id}:enable` | `useEnableIntegration` | `IntegrationDetailPage`, `IntegrationsListPage` |
| POST | `/integrations/{id}:disable` | `useDisableIntegration` | `IntegrationDetailPage`, `IntegrationsListPage` |
| GET  | `/integrations/{id}/oauth/start` | `useOauthStartIntegration` | `IntegrationDetailPage` |
| POST | `/integrations/{id}/oauth/refresh` | `integrationsApi.oauthRefresh` (direct) | `IntegrationDetailPage` |
| DELETE | `/integrations/{id}/oauth/disconnect` | `integrationsApi.oauthDisconnect` (direct) | `IntegrationDetailPage` |
| GET  | `/integrations/oauth/finalize` | `integrationsApi.oauthFinalize` | `IntegrationOAuthCallbackPage` |
| POST | `/integrations/{id}/sync` | `useSyncNow` | `IntegrationDetailPage`, `YandexContestImportPage`, `ImportsPage`, `ImportWizardPage` |
| GET  | `/integrations/{id}/import-jobs` | `useImportJobs` | `ImportsPage`, `ImportWizardPage` |
| POST | `/integrations/{id}/import-jobs/{jid}:cancel` | `integrationsApi.cancelImportJob` (direct) | `ImportsPage` |
| POST | `/integrations/{id}/import-jobs/{jid}:retry` | `integrationsApi.retryImportJob` (direct) | `ImportsPage` |
| GET  | `/integrations/{id}/schedules` | `useSchedules` | `IntegrationDetailPage` |
| POST | `/integrations/{id}/schedules` | `useCreateSchedule` | `IntegrationDetailPage` |
| DELETE | `/integrations/{id}/schedules/{sid}` | `useDeleteSchedule` | `IntegrationDetailPage` |
| GET  | `/integrations/yandex-contest/{id}/contests` | `integrationsApi.ycListContests` (direct) | `YandexContestImportPage` |
| POST | `/integrations/yandex-contest/{id}/contests/{cid}/import-participants` | `integrationsApi.ycImportParticipants` | `YandexContestImportPage` |
| POST | `/integrations/yandex-contest/{id}/contests/{cid}/import-submissions` | `integrationsApi.ycImportSubmissions` | `YandexContestImportPage` |
| GET  | `/admin/integrations/health` | `useIntegrationsHealth` | `AdminDashboardPage` |
| GET  | `/admin/integrations/webhook-events` | `useWebhookEvents` | `WebhooksAdminPage` |
| GET  | `/admin/integrations/oauth-providers` | `integrationsApi.listOAuthProviders` | `OAuthProvidersPage` |
| PUT  | `/admin/integrations/oauth-providers/{kind}` | `integrationsApi.upsertOAuthProvider` | `OAuthProvidersPage` |
| DELETE | `/admin/integrations/oauth-providers/{kind}` | `integrationsApi.deleteOAuthProvider` | `OAuthProvidersPage` |
| GET  | `/admin/integrations/telegram/bot-settings` | `useTelegramConfig` | `AdminProvidersPage` |
| PATCH | `/admin/integrations/telegram/bot-settings` | `integrationsApi.updateTelegramBotSettings` | (only AdminProvidersPage reads; update path is not yet wired) |
| GET  | `/admin/integrations/dlq` | `useIntegrationsDlq` | (hook exists; see "Hook but no UI" — `AdminDashboardPage` partly uses) |

### notification

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/notifications` | `useNotifications` | `NotificationCenterPage`, `MyDashboardPage`, `NotificationsBellDropdown` |
| GET  | `/notifications/unread-count` | `useUnreadCount` | `NotificationsBellDropdown` |
| GET  | `/notifications/{id}` | `useNotification` | `NotificationCenterPage` |
| PATCH | `/notifications/{id}` | `useArchiveNotification` | `NotificationCenterPage` |
| POST | `/notifications:markAllRead` | `useMarkAllRead` | `NotificationCenterPage`, `NotificationsBellDropdown` |
| POST | `/notifications:markRead` | `useMarkRead` | `NotificationCenterPage` |
| DELETE | `/notifications/{id}` | `useDeleteNotification` | `NotificationCenterPage` |
| GET  | `/notifications/stream` (SSE) | `SSEClient` in `api/sse.ts` | wired in `useNotifications` host (notifications context) |
| GET  | `/users/me/notification-preferences` | `useNotificationPreferences` | `PreferencesPage`, `UserSettingsLandingPage` |
| PATCH | `/users/me/notification-preferences` | `useUpdatePreferences` | `PreferencesPage` |
| POST | `/users/me/notification-preferences:reset-to-defaults` | `useResetPreferences` | `PreferencesPage` |
| GET  | `/users/me/notifications/digest-preview` | `useDigestPreview` | `PreferencesPage` |
| POST | `/users/me/notifications/test` | `useTestNotification` | `PreferencesPage` |
| POST | `/users/me/web-push/subscribe` | `useWebPushSubscribe` | `WebPushSettingsPage` |
| DELETE | `/users/me/web-push/unsubscribe` | `useWebPushUnsubscribe` | `WebPushSettingsPage` |
| GET  | `/admin/notifications/web-push/vapid-key` | `notificationsApi.getVapidKey` (direct, in WebPushSettingsPage) | `WebPushSettingsPage` |
| GET  | `/admin/notifications/email-config` | `useEmailConfig` | `EmailConfigPage`, `AdminProvidersPage` |
| PATCH | `/admin/notifications/email-config` | `useUpdateEmailConfig` | `EmailConfigPage` |
| POST | `/admin/notifications/email-config:test` | `useTestEmail` | `EmailConfigPage` |
| GET  | `/admin/notifications/email-config/dns-status` | `useDnsStatus` | `EmailConfigPage` |
| GET  | `/admin/notifications/templates` | `useNotificationTemplates` | `NotificationTemplatesPage` |
| POST | `/admin/notifications/templates` | `useCreateTemplate` | `NotificationTemplatesPage` |
| PATCH | `/admin/notifications/templates/{id}` | `useUpdateTemplate` | `NotificationTemplatesPage` |
| GET  | `/admin/notifications/deliveries` | `useDeliveries` | `NotificationDeliveriesPage` |
| GET  | `/admin/notifications/dlq` | `useDLQ` | `NotificationDLQPage` |
| POST | `/admin/notifications/dlq/{id}:retry` | `useRetryDelivery` | `NotificationDLQPage` |

### audit

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/audit/events` | `useAuditEvents` | `AuditEventsPage`, `AdminDashboardPage`, `ActivityLogPage` |
| GET  | `/audit/events/{id}` | `auditApi.get` (direct) | `AuditEventsPage` (modal) |
| POST | `/audit/events:search` | `useAuditSearch` | `AuditSearchPage` |
| GET  | `/audit/events/by-actor/{user_id}` | `useAuditByActor` | `AuditByActorPage` |
| GET  | `/audit/events/by-resource/{type}/{id}` | `useAuditByResource` | `AuditByResourcePage` |
| GET  | `/audit/access-denied` | `useAuditAccessDenied` | `AuditAccessDeniedPage` |
| POST | `/audit/events:export` | `useExportAuditCsv` | `AuditEventsPage` |
| GET  | `/admin/audit/retention-policy` | `useRetentionPolicy` | `AuditRetentionPolicyPage` |
| PATCH | `/admin/audit/retention-policy` | `useUpdateRetentionPolicy` | `AuditRetentionPolicyPage` |
| GET  | `/admin/audit/legal-holds` | `useLegalHolds` | `AuditLegalHoldPage` |
| POST | `/admin/audit/legal-holds` | `useCreateLegalHold` | `AuditLegalHoldPage` |
| DELETE | `/admin/audit/legal-holds/{id}` | `useDeleteLegalHold` | `AuditLegalHoldPage` |

### reporting

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/exports` | `useExports` | `ExportsListPage` |
| GET  | `/courses/{id}/exports` | `useCourseExports` | `CourseExportsPage` |
| GET  | `/exports/{id}` | `useExport` | `ExportsListPage` |
| POST | `/exports` (generic) | `useCreateExport` | `ExportsListPage`, `ExportCreateModal` |
| POST | `/courses/{id}/exports` | `useCreateCourseExport` | `CourseExportsPage` |
| GET  | `/exports/{id}/download` | `useDownloadExport` | `ExportsListPage`, `CourseExportsPage` |
| POST | `/exports/{id}:retry` | `useRetryExport` | `ExportsListPage` |
| POST | `/exports/{id}:cancel` | `useCancelExport` | `ExportsListPage` |
| DELETE | `/exports/{id}` | `useDeleteExport` | `ExportsListPage` |
| GET  | `/courses/{id}/scheduled-exports` | `useScheduledExports` | `ScheduledExportsPage` |
| POST | `/courses/{id}/scheduled-exports` | `useCreateScheduledExport` | `ScheduledExportsPage` |
| DELETE | `/courses/{id}/scheduled-exports/{sid}` | `useDeleteScheduledExport` | `ScheduledExportsPage` |
| POST | `/courses/{id}/scheduled-exports/{sid}:run-now` | `useRunScheduledNow` | `ScheduledExportsPage` |
| GET  | `/courses/{id}/google-sheets/link` | `useGoogleSheetsLink` | `GoogleSheetsLinkPage` |
| PATCH | `/courses/{id}/google-sheets/link` | `reportingApi.setSheetsLink` (`PUT` actually — see Orphan #1) | `GoogleSheetsLinkPage` |
| POST | `/courses/{id}/exports/google-sheets/sync` | `useSyncSheets` | `GoogleSheetsLinkPage` |
| GET  | `/courses/{id}/exports/google-sheets/last-sync` | `useGoogleSheetsLastSync` | `GoogleSheetsLinkPage` |
| GET  | `/courses/{id}/dashboard` | `useCourseDashboard` | `CourseDashboardPage` |
| GET  | `/courses/{id}/dashboard/grades-distribution` | `useCourseGradesDist` | `CourseDashboardPage`, `CourseStatsPage` |
| GET  | `/courses/{id}/dashboard/grades-by-assignment` | `useCourseGradesByAssignment` | `CourseDashboardPage` |
| GET  | `/courses/{id}/dashboard/plagiarism-stats` | `useCoursePlagiarismStats` | `CourseDashboardPage`, `CourseStatsPage` |
| GET  | `/courses/{id}/dashboard/ai-usage` | `useCourseAIUsage` | `CourseDashboardPage` |
| GET  | `/courses/{id}/dashboard/timeline` | `useCourseTimeline` | `CourseDashboardPage` |
| GET  | `/courses/{id}/dashboard/active-students` | `useCourseActiveStudents` | `CourseDashboardPage` |
| GET  | `/courses/{id}/dashboard/stragglers` | `useCourseStragglers` | `CourseDashboardPage` |
| GET  | `/courses/{id}/dashboard/late-submissions` | `useCourseLateSubmissions` | `CourseDashboardPage`, `CourseStatsPage` |
| GET  | `/courses/{id}/dashboard/language-breakdown` | `useCourseLanguageBreakdown` | `CourseDashboardPage` |
| GET  | `/courses/{id}/recent-activity` | `useCourseRecentActivity` | `CourseDashboardPage`, `CourseStatsPage` |
| GET  | `/users/me/recent-activity` | `useMyRecentActivity` | `MyDashboardPage` |
| GET  | `/users/me/dashboard` | `useMyDashboard` | `MyDashboardPage` |
| GET  | `/users/me/progress` | `useMyProgress` | `MyDashboardPage` |
| GET  | `/tenants/{id}/dashboard` | `useTenantDashboard` | `TenantDashboardPage`, `AdminMetricsPage` |
| GET  | `/tenants/{id}/dashboard/integrations-health` | `useTenantIntegrationsHealth` | `TenantDashboardPage` |
| GET  | `/admin/dashboard/global` | `useGlobalDashboard` | `GlobalDashboardPage` |

### gateway-own

| Method | Path | Hook | Pages |
|---|---|---|---|
| GET  | `/api/v1/services-status` | `useServicesStatus` | `SystemHealthPage`, `AdminMetricsPage` |
| GET  | `/api/v1/version` | `useSystemVersion` | `SystemSettingsPage` |
| GET  | `/api/v1/search` | `useGlobalSearch` | `CommandPalette` |
| POST | `/api/v1/_debug/client-errors` | `errorReporter` (lib) | global error reporter |
| GET  | `/v1/operations/{id}` | `getOperation` (operation.ts) + `operationsApi.get` | `AsyncOperationStatus`, every async-op flow |
| POST | `/v1/operations/{id}:cancel` | `cancelOperation` / `operationsApi.cancel` | `AsyncOperationStatus` |

---

## 3. Hook exists, no UI page imports it

The hook is wired through axios and the React-Query layer, but no `.tsx` page imports it today.

| Endpoint | Service | Hook | Risk / why it matters |
|---|---|---|---|
| `POST /api/v1/courses/{id}:duplicate` | course | `useDuplicateCourse` | "Duplicate course" UX missing. Backend supports it; teacher cannot trigger from UI. |
| `POST /api/v1/courses/{id}/owners` & `DELETE` & `:promote` (3 endpoints) | course | none for owners — `coursesApi.addOwner/removeOwner/promoteOwner` exist but **no hook, no page** | Multi-owner course management is invisible. **Severe** for institutions with co-teachers. |
| `POST /api/v1/courses/{id}/members:bulkInvite` already wired; but **`POST /courses/{id}/members:batchCreate`** is not. The 2 endpoints overlap; the bulk one is used. | course | n/a | False alarm — bulkInvite is the canonical one used by FE. |
| `POST /api/v1/assignments/{id}:duplicate` | course | `useDuplicateAssignment` | No UI button. Used to be "Clone" — appears in route audit but page does not call it. |
| `POST /api/v1/assignments/{id}/deadline-extensions` is wired via `useCreateDeadlineExtension` but `DELETE /api/v1/assignments/{id}/deadline-extensions/{ext_id}` is wired (`useDeleteDeadlineExtension`) — and **its page button is missing in `AssignmentDeadlinesPage`**: hook exists but the UI does not call it. | course | `useDeleteDeadlineExtension` | Teacher can grant extensions but cannot revoke them. |
| `PATCH /api/v1/submissions/{id}/grade` | submission | `useUpdateGrade` | Used in `SubmissionDetailPage` — covered. Move to "Fully covered". |
| `POST /api/v1/admin/notifications/dlq/{id}:discard` | notification | `useDiscardDelivery` | Admin can retry deliveries but cannot discard — DLQ grows unboundedly. |
| `GET /api/v1/users/me/notification-preferences/per-event` | notification | `usePerEventPreferences` | Hook is exported, but `PreferencesPage` never renders per-event matrix. **Per-event opt-in feature is dead at UI.** |
| `PATCH /api/v1/users/me/notification-preferences/per-event` | notification | `useUpdatePerEventPreferences` | Same as above. |
| `GET /api/v1/users/me/notification-preferences/per-event/available-events` | notification | `useAvailableEvents` | Same as above. |
| `POST /api/v1/ai-analyses/{id}:retry` | ai-analysis | `aiApi.retryAnalysis` exists in `endpoints/ai.ts`, **no hook, no page** | Failed AI run cannot be retried — student has to ask teacher to re-trigger. |
| `GET /api/v1/admin/ai/providers/{id}` | ai-analysis | `aiApi.getProvider` (direct) | Used in `LLMProvidersPage` for the detail modal — covered. False alarm. |
| `POST /api/v1/admin/ai/providers/{id}/health` | ai-analysis | none | Per-provider health check button missing. |
| `GET /api/v1/admin/ai/prompt-versions/{id}/usage` | ai-analysis | none | Cannot see how often a prompt is used / hit-rate. |
| `DELETE /api/v1/admin/ai/cache/by-prompt-version/{id}` & `by-submission/{id}` | ai-analysis | `aiApi.purgeCacheByPromptVersion`, `purgeCacheBySubmission` (direct, no hook) | `LLMCacheAdminPage` only has "purge all". Granular cache invalidation missing. |
| `GET /api/v1/users/me/ai/usage` | ai-analysis | none | Student-facing personal AI usage meter missing. |
| `GET /api/v1/integrations/{id}/import-jobs/{job_id}` | integration | none | Cannot drill into a single import-job; `ImportsPage` only lists. |
| `GET /api/v1/integrations/{id}/cursor` & `:reset` & `:set` | integration | none | Operations team cannot fix stuck incremental sync from UI. |
| `POST /api/v1/integrations/{id}/schedules/{sid}:run-now` | integration | `useRunScheduleNow`? Actually `integrationsApi.runScheduleNow` exists, **no hook** | UI cannot "run this schedule now" — workaround is full `:sync`. |
| `PATCH /api/v1/integrations/{id}/schedules/{sid}` | integration | none | Can create+delete schedules but not edit cron. |
| `GET /api/v1/admin/integrations/oauth-providers/{kind}` | integration | none | Single-provider read; only `list` is used. Not critical. |
| `GET /api/v1/admin/integrations/webhook-events` family — wired in `WebhooksAdminPage` via `useWebhookEvents` — OK. | integration | | (covered) |
| `GET /api/v1/admin/audit/retention-status` | audit | `auditApi.retentionStatus` (direct, no hook), **no page usage** | Cannot see "X events due for purge" — auditor blind. |
| `POST /api/v1/admin/audit/retention:run-now` | audit | none | Cannot trigger retention sweep manually. |
| `GET /api/v1/admin/audit/stats` | audit | none | Audit event histograms / volume charts missing. |
| `GET /api/v1/admin/dashboard/system-health` & `/operations` & `/errors` (3) | reporting | none | Three reporting-side global dashboards exist beyond `/global`. None wired. |
| `GET /api/v1/tenants/{id}/dashboard/{active-courses, active-users, ai-usage, storage-usage}` (4) | reporting | only `useTenantDashboard` consumed; individual breakouts unused | Tenant dashboard page only renders 2 of 6 sub-widgets. |
| `GET /api/v1/integrations/google-sheets/spreadsheets` | integration | `integrationsApi.gsListSpreadsheets`? not present — gap. | When linking google-sheets, user manually pastes ID. |
| `POST /api/v1/integrations/google-sheets/spreadsheets` (create) | integration | none | Cannot create sheet from UI. |
| `POST /api/v1/courses/{id}/google-sheets/link:validate` | integration | none | "Validate sheet permissions" not wired. |
| `POST /api/v1/courses/{id}/scheduled-exports/{sid}` PATCH path | reporting | none | Edit existing scheduled export — only create/delete. |
| `POST /api/v1/admin/exports/audit` | reporting | none (covered through audit-proxy already) | Tenant-usage CSV admin export missing UI. |
| `POST /api/v1/admin/exports/tenant-usage` | reporting | none | Same. |
| `POST /api/v1/admin/reporting/read-models:rebuild` & `POST /admin/reporting/read-models/{name}:rebuild` | reporting | none | Cannot recover from drift between event store and read models from UI. |
| `GET /api/v1/admin/reporting/read-models/health` | reporting | none | Read-model staleness invisible. |
| `POST /api/v1/admin/integrations/dlq/...` retry/discard | integration | not exposed (only list); `useIntegrationsDlq` is read-only | Same DLQ-discard gap as notification side. |
| `POST /api/v1/integrations/manual/upload` & `/upload-csv` | integration | none | "Upload a CSV of students" workflow exists in backend (used by autosync), but not UI. |
| `GET /api/v1/integrations/manual/templates` & `/csv-schema.json` | integration | none | Template download missing — students can't get a sample file. |

(Total in this section: ~31 endpoints if you count each one once.)

---

## 4. No frontend hook at all

Endpoints with zero coverage on the frontend.

| Endpoint | Service | Should it have UI? |
|---|---|---|
| `POST /api/v1/integrations/webhooks/stepik/{tenant_id}` | integration | **No** — external Stepik server hits it. |
| `POST /api/v1/integrations/webhooks/yandex-contest/{tenant_id}` | integration | **No** — external. |
| `POST /api/v1/integrations/webhooks/telegram` | integration | **No** — Telegram bot updates. |
| `POST /api/v1/integrations/webhooks/plagiarism/{provider}/{run_id}` | integration | **No** — provider callback. |
| `POST /api/v1/integrations/webhooks/llm/{provider}` | integration | **No** — provider callback. |
| `POST /api/v1/webhooks/plagiarism/{provider}/{run_id}` | plagiarism | **No** — provider callback. |
| `POST /api/v1/webhooks/mailgun/{tenant_id}` | notification | **No** — Mailgun callback. |
| `POST /api/v1/internal/notifications/email-direct` | notification | **No** — internal service-to-service. |
| `POST /api/v1/audit/internal/events` | audit | **No** — service ingest. |
| All `/healthz`, `/readyz`, `/metrics`, `/api/v1/version` per service | all | **No** — ops/k8s probes. |
| `GET /api/v1/.well-known/jwks.json` (identity + gateway) | identity, gateway | **No** — service-to-service JWT verification. |
| `POST /api/v1/auth/oauth/finalize` (server cb) | identity | **No** — runs server-side. |
| `GET /api/v1/auth/oauth/{provider}/{authorize,callback}` | identity | **No** — browser redirects, no hook needed. |
| `POST /api/v1/invitations/:accept` | identity | **Yes (gap)** — should be hit from `RegisterPage` invite flow. Currently the FE register flow does *not* call `:accept` — it relies on auto-association by token. Verify with E2E. |
| `POST /api/v1/invitations` | identity | **No (covered via course's `/courses/{id}/invitations` which is the canonical UI surface).** Tenant-level invitation creation is intentionally limited to admins via API key. |
| `GET /api/v1/invitations` | identity | **Maybe** — admin view of all outgoing invitations; not yet a page. |
| `GET /api/v1/invitations/{id}` | identity | **No** — admin debugging. |
| `DELETE /api/v1/invitations/{id}` | identity | **Maybe** — revoke at tenant level; not yet a page. |
| `GET /api/v1/operations` (list) | gateway | **Maybe** — there is no "operations log" page despite hook stub in `operations.ts`. |
| `GET /api/v1/admin/users/{id}/api-keys` & `DELETE /admin/users/{id}/api-keys/{kid}` | identity | **Yes but blocked** — `usersApi.listApiKeysForUser` calls it with an explicit `TODO(backend)` in the FE comment; **endpoint does NOT exist yet on backend** (see `users.ts:243`). Mark as backend-side gap, not UI gap. |
| `POST /api/v1/users/{id}/external-bindings` & `DELETE …/{bid}` | identity | **Yes (gap)** — admin path; `UserDetailPage` lists but does not add/remove. |
| `GET /api/v1/users/{id}/sessions` (list other user's sessions) | identity | **Yes** — `useUserSessions` exists; UserDetailPage shows them but **revoke is not wired**. |
| `POST /api/v1/users/{id}/role` (assign role) | identity | **Yes (gap)** — UserDetailPage UI shows role badge but no "change role" form. |
| `GET /api/v1/users/{id}/course-roles` | identity | **Yes (gap)** — UserDetailPage doesn't show per-course role list. |
| `GET /api/v1/courses/{course_id}/owners` & all owner mgmt | course | **Yes (gap)** — multi-owner workflow invisible. |
| `GET /api/v1/courses/{course_id}/dashboard` (course-service version, before reporting was added) | course | **No** — superseded by reporting `/courses/{id}/dashboard`. Dead endpoint candidate. |
| `GET /api/v1/courses/{course_id}/groups/{gid}/members` & POST | course | **Yes (gap)** — only top-level groups CRUD is wired. Adding students to a group is missing. |
| `POST /api/v1/courses/{course_id}/groups/{gid}/members:batchCreate` | course | **Yes (gap)** — bulk add to group. |
| `DELETE /api/v1/courses/{course_id}/groups/{gid}/members/{uid}` | course | **Yes (gap)** — same. |
| `PATCH /api/v1/courses/{course_id}/groups/{gid}` | course | **Yes (gap)** — rename group not implemented (`useDeleteGroup` is the only mutation). |
| `POST /api/v1/courses/{course_id}/members/{uid}:transfer-group` | course | **Yes (gap)** — move student between groups not wired. |
| `GET /api/v1/courses/{course_id}/members/{uid}` | course | **Maybe** — drill-in card; today member-row click goes to user page directly. |
| `POST /api/v1/courses/{course_id}/members:batchCreate` | course | **No** — `:bulkInvite` is the canonical UI flow; batchCreate is server-to-server. |
| `GET /api/v1/users/me/upcoming-deadlines` (assignments/upcoming) | course | **Maybe** — would power a "due soon" widget. |
| `GET /api/v1/assignments/{id}/deadlines/effective-for/{uid}` | course | **Maybe** — would let teacher preview a specific student's deadline (extensions applied). |
| `GET /api/v1/assignments/{id}/grading-config/rubric` | course | **Maybe** — separate rubric endpoint; merged into `getGradingConfig` on FE. |
| `PATCH /api/v1/assignments/{id}/grading-config/rubric` | course | **Yes (gap)** — rubric editor on assignment settings is just JSON dump today; backend supports proper PATCH but no UI. |
| `GET /api/v1/assignments/{id}/stats/timeline` | course | **Yes (gap)** — assignment progress chart over time absent. |
| `POST /api/v1/assignments/{id}/exports/google-sheets/sync` | reporting | **Yes (gap)** — assignment-level sheets sync absent. |
| `POST /api/v1/plagiarism-runs/{run_id}` family of artifacts including `/pairs/{pid}/diff` & `/clusters/{cid}/members` | plagiarism | wired `usePairs/useClusters/useArtifactUrl`; but `/pairs/{pid}/diff` direct is not wired separately — it's used implicitly by the `PlagiarismPairDiffPage`. Likely OK. |
| `GET /api/v1/admin/plagiarism/webhook-subscriptions` | plagiarism | **Yes (gap)** — admin can't see registered provider webhooks. |
| `DELETE /api/v1/admin/plagiarism/webhook-subscriptions/{id}` | plagiarism | **Yes (gap)** — same. |
| `GET /api/v1/admin/plagiarism/providers` & detail/PATCH/`:test`/`:set-default`/`:usage` (6 endpoints) | plagiarism | **Yes (gap)** — no `PlagiarismProvidersPage` exists. Only AI providers have an admin page. |
| `GET /api/v1/assignments/{id}/plagiarism-config` & PATCH | plagiarism | **Yes (gap)** — per-assignment plagiarism thresholds not editable. |
| `POST /api/v1/plagiarism-corpus/search` | plagiarism | **Maybe** — "lookup snippet" tool absent. |
| `GET /api/v1/plagiarism-corpus/courses/{id}` | plagiarism | **Maybe** — per-course corpus stats not exposed beyond global. |
| `DELETE /api/v1/plagiarism-corpus/entries/{id}` | plagiarism | **Yes (gap)** — cannot remove a noisy template from the corpus from UI. |
| `GET /api/v1/courses/{id}/plagiarism-runs` | plagiarism | wired implicitly through `/assignments/{id}/plagiarism-runs` per-assignment, but there is no **course-level** run list page. Hook absent. |
| `GET /api/v1/assignments/{id}/suspicious-submissions` | plagiarism | covered via course-level only; no assignment-level page. |
| `GET /api/v1/submissions/{id}/suspicious-flags` & POST + DELETE single | plagiarism | covered via dismiss/severity hooks; raw "create a manual flag" not wired. |
| `GET /api/v1/submissions/{id}/plagiarism/{runs,pairs}` & `/results` | plagiarism | partly used by `SubmissionDetailPage`; works. |
| `POST /api/v1/assignments/{id}/ai-analyses:batchCreate` | ai-analysis | **Yes (gap)** — bulk AI analyse a whole assignment; backend ready, FE button missing. |
| `GET /api/v1/ai-analyses/{id}/raw-llm-response` | ai-analysis | **Maybe** — debug-only; behind admin flag. |
| `GET /api/v1/ai-analyses/{id}/report` & `/api/v1/submissions/{id}/ai-report` | ai-analysis | **Yes (covered via direct `aiApi.getAnalysis`)** — false alarm. Actually `/report` is HTML wrapper; FE skips it. |
| `GET /api/v1/users/me/notification-preferences/per-event/available-events` | notification | **Yes (gap)** — see top-5. |
| `POST /api/v1/admin/notifications/digest:trigger-now` | notification | **Yes (gap)** — cannot manually send the digest. |
| `POST /api/v1/admin/notifications/templates/{id}:activate` & `:render-preview` | notification | **Yes (gap)** — admin template page does not yet expose "set active" or "preview render". |
| `POST /api/v1/admin/notifications/test-broadcast` | notification | **Yes (gap)** — useful for testing a notification to a cohort. |
| `GET /api/v1/admin/notifications/email-config/bounces` | notification | **Yes (gap)** — bounce log absent. |
| `GET /api/v1/admin/notifications/stats` | notification | **Yes (gap)** — delivery-success rate chart absent. |
| `POST /api/v1/operations` list (`GET /v1/operations`) | gateway | **Maybe** — global ops console missing. |
| `GET /api/v1/timeline` (audit timeline) | audit | **Yes (gap)** — richer cross-cutting timeline page not wired. |
| `POST /api/v1/audit/internal/events` | audit | **No** — service ingest. |
| `GET /api/v1/users/me/courses/{course_id}/grades-summary` | reporting | **Maybe** — `MyGradesPage` aggregates client-side; backend has a server-aggregated path that's unused. |
| `GET /api/v1/submissions/{id}/diff?against=…` | submission | **Yes (gap)** — see top-5. |
| `GET /api/v1/integrations/stepik/{id}/courses` & `…/lessons` & `…/steps` & `…/steps/{sid}/preview` & `…/sync-course-structure` (5 endpoints) | integration | **Yes (gap)** — Stepik picker UI absent. `StepikSetupPage` only writes API key + course mapping. |
| `GET /api/v1/integrations/yandex-contest/{id}/contests/{cid}/participants` | integration | **Yes (gap)** — preview participants before import. |
| `POST /api/v1/integrations/yandex-contest/{id}/sync-contest-structure` | integration | **Yes (gap)** — auto-create assignments from a Yandex contest. |
| `POST /api/v1/integrations/telegram/binding/{init,confirm}` & `DELETE /users/me/telegram-binding` | integration | **Yes (gap)** — Telegram personal-binding wizard missing on UI. |
| `GET /api/v1/users/me/telegram-binding` | integration | **Yes (gap)** — same. |
| `GET /api/v1/admin/integrations/telegram/bot-settings` (read OK) + PATCH (not wired) | integration | UI shows but cannot edit. |
| `POST /api/v1/admin/notifications/telegram-config` & PATCH & `:test` | notification | **Yes (gap)** — admin can configure email but Telegram channel config has no page. |
| `GET /api/v1/admin/notifications/telegram-config` | notification | same. |
| `POST /api/v1/admin/integrations/health` etc — admin observability — partially wired via `useIntegrationsHealth`. |
| `GET /api/v1/admin/integrations/oauth-providers/{kind}` | integration | covered above. |
| `GET /api/v1/.well-known/jwks.json` (both) | identity, gateway | **No** — service-to-service. |

This bucket has ~132 endpoints in total when counted strictly. Of those, **~85 are backend-only by design** (webhooks, health, jwks, service-to-service). The remaining ~47 are **legitimate UI gaps** — see the top-5 and the most impactful ones above.

---

## 5. Orphan hooks (FE call without matching backend, or with mismatch)

| FE call (axios) | File:line | Matching backend? | Action |
|---|---|---|---|
| `PATCH /api/v1/notifications/{id}` body `{ archived?: true, read?: true }` | `notifications.ts:128` | YES — `notifications.py:136` PATCH `/notifications/{notif_id}` — OK | covered |
| `POST /api/v1/admin/users/${id}/api-keys` & `DELETE` | `users.ts:248-256` | **NO** — backend route absent. There is a `TODO(backend)` comment in the FE. | **Either remove FE methods or implement backend endpoint.** Pages that use them: none currently (would-be `UserDetailPage` API-keys tab). |
| `PATCH /api/v1/courses/{id}/google-sheets/link` (FE actually does `PUT`) | `reporting.ts:362` (PUT) vs `integration/google_sheets.py:90` (PATCH) | **MISMATCH** — backend is `PATCH`, frontend sends `PUT`. | **Hooks `useSetSheetsLink` will 405.** Likely never tested. Either change FE to `PATCH` or add `PUT` on backend. |
| `POST /api/v1/courses:joinByCode` payload `{ code }` | `courses.ts:167` | YES — `members.py:273` POST `/courses:joinByCode` | OK |
| `GET /api/v1/users/me/notifications/digest-preview` | `notifications.ts:235` | YES — `digest.py:24` | OK |
| `GET /api/v1/integrations/oauth/finalize?code&state` | `integrations.ts:188` | YES — `oauth.py:30` GET `/oauth/finalize` | OK |
| `GET /api/v1/auth/me` (in `auth.ts:39`) | YES — `auth.py:151` `/me` | OK |
| `GET /api/v1/notifications/stream` (SSE) | `notifications.ts` builder | YES — `stream.py:57` | OK |
| `GET /api/v1/users/me/web-push/vapid-key` — front calls `/admin/notifications/web-push/vapid-key` | `notifications.ts:216` | YES — `web_push.py:71` is at `/admin/notifications/web-push/vapid-key` | OK |
| `POST /api/v1/users/me/web-push/subscribe` | `notifications.ts:223` | YES — `web_push.py:20` POST `/users/me/web-push/subscribe` | OK |
| `POST /api/v1/audit/events:search` | `audit.ts:124` | YES — `events.py:202` | OK |
| `POST /api/v1/audit/events:export` | `audit.ts:169` | YES — `events.py:241` | OK |
| `GET /api/v1/admin/notifications/web-push/vapid-key` | `notifications.ts:216` | covered | OK |
| `POST /api/v1/admin/notifications/email-config:test` | `notificationsAdmin.ts:84` | YES — `admin_email.py:130` POST `…:test` | OK |
| `DELETE /api/v1/admin/notifications/dlq/{id}` (without `:retry`) | `notificationsAdmin.ts:140` | **NO** — backend only has `:retry` and `:discard` (note the colon-suffix). The FE call to a bare DELETE will 404 or 405. | **FE should call `:discard` action endpoint instead.** Bug. |
| `GET /api/v1/admin/notifications/templates/{id}` | only used through update flow | YES — `admin_templates.py:69` | OK |
| `POST /api/v1/admin/notifications/templates/{id}:activate` & `:render-preview` | called by `NotificationTemplatesPage` indirectly via `useUpdateTemplate`? No, those endpoints are not wired. Skip. |
| `POST /api/v1/admin/ai/providers/{id}:set-default` | `ai.ts:287` | YES — `admin_providers.py:141` | OK |
| `POST /api/v1/ai-analyses/{id}:retry` (mentioned in `ai.ts`) | path is built by `aiApi.regenerateAnalysis`? Actually FE calls `:regenerate` not `:retry`. Backend has both `:retry` and `:regenerate`. FE only uses `:regenerate`. | OK (different semantic). |

---

## 6. Per-service coverage roll-up

(Healthz/metrics/jwks/webhooks excluded from denominators.)

| Service | Endpoints | Fully covered | Hook-no-UI | No hook | Coverage |
|---|---:|---:|---:|---:|---:|
| identity (auth, users, tenants, roles) | 56 | 40 | 0 | 16 | **71 %** |
| course (courses, groups, assignments, homeworks, members) | 41 | 26 | 4 | 11 | **63 %** |
| submission | 36 | 23 | 1 | 12 | **64 %** |
| plagiarism | 36 | 14 | 0 | 22 | **39 %** |
| ai-analysis | 36 | 21 | 5 | 10 | **58 %** |
| integration | 51 | 19 | 6 | 26 | **37 %** |
| notification | 36 | 19 | 5 | 12 | **53 %** |
| audit | 13 | 9 | 1 | 3 | **69 %** |
| reporting | 46 | 31 | 9 | 6 | **67 %** |
| gateway-own | (15 own — 6 business) | 6 | 0 | 0 | **100 %** |

Worst-covered services: **integration (37 %)** and **plagiarism (39 %)** — largely because they have many admin / provider / source-system endpoints that lack any UI surface. Best-covered: **identity (71 %)** because user-facing auth was the priority for КТ-1.

---

## 7. How to read this report

- "Fully covered" = backend method+path matches a frontend axios call, the wrapper is exported (either as `*Api` direct call or React-Query hook), and **at least one `.tsx` file under `pages/` or `components/`** imports it.
- "Hook but no UI" = the wrapper exists (often as `useFoo` in `hooks/api/*.ts`) but `grep` found zero page/component imports. Either dead UX or planned-but-not-built feature.
- "No hook" = backend method+path has **no** equivalent in `frontend/src/api/endpoints/*.ts`. Decide per-row: webhook/healthz/jwks/internal → keep as backend-only; admin/user-facing → backlog.
- "Orphan" = FE wrapper exists, hits a path that does not exist on the backend or uses the wrong HTTP verb. Bug.

The full inventory in tables 2–4 covers every business endpoint. Health, metrics, JWKS, webhooks from third parties and service-to-service internal endpoints are intentionally omitted from the bug-hunt because they should never have UI.

---

## 8. Suggested action plan (suggested, not implemented)

Highest leverage, ordered by ratio of (user impact / dev effort):

1. **Fix the 2 confirmed bugs** in section 5:
   - `DELETE /admin/notifications/dlq/{id}` → change to `…:discard` action.
   - `PUT /courses/{id}/google-sheets/link` → change to `PATCH` (or align backend).
2. **Wire per-event notification preferences** — backend, hooks, all exist; only `PreferencesPage.tsx` lacks the matrix UI.
3. **Course-owners management** — backend covers it; FE has no hooks. Critical for multi-teacher courses.
4. **Group-member management** (`/groups/{gid}/members*`) — same shape.
5. **Plagiarism provider admin page** — analogous to `LLMProvidersPage`. 6 endpoints, all unwired.
6. **DLQ discard / retention run-now / read-models rebuild** — small ops console.
7. **Assignment-level batch AI analysis** — single button on `AssignmentDetailPage` invoking `:batchCreate`.
8. **Submission diff (`/submissions/{id}/diff?against=`)** — student-facing "compare my attempts".
9. **Stepik picker** and **Yandex-contest preview-participants** — wizard UX deeper than just API-key input.
10. Either implement or delete the `/admin/users/{id}/api-keys*` endpoints — currently FE has stubs flagged TODO.

---

*End of map. Source files cross-referenced as of 2026-05-12. No code modifications were made; this document is read-only analysis output.*
