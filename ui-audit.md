# UI audit — Kaggle-style миграция всех страниц

Дата: 2026-05-12.

Цель: убедиться что каждая страница соответствует `design-system.md` —
`<Page>` контейнер, `<StatusPill>` вместо цветных Badge, `<StatsPanel>` вместо
KPI-сеток на дашбордах, документ-стиль на settings/profile, underline tabs,
rounded-full buttons, без advisory copy.

## TL;DR

```
pages with <Page> container:    65 / 100
pages with <StatusPill>:        25 / 100 (применяется только где нужны статусы)
broken pages (route-audit):     0  / 79  ← полный crawl под admin/teacher/student
TypeScript compile:             clean
Integration smoke:              6 pass / 3 partial-empty-data / 0 fail
500/CRASH crashes fixed:        2 (SystemHealthPage, PromptVersionsPage — optional chaining)
orphan-hook bugs fixed:         2 (DLQ verb mismatch, GoogleSheets PUT→PATCH)
react-query warnings fixed:     1 (useProviders undefined shape)
```

## Применение дизайн-системы по группам страниц

### A. Документ-страницы (settings, profile, single-form admin)
Полностью мигрированы. **Card-count = 0**, всё на `<Page width="narrow">` + `<section>` + H2 + hairline border-t.

- `me/MySettingsPage` ✓
- `me/ProfilePage` ✓
- `me/UserSettingsLandingPage` ✓
- `me/MyApiKeysPage` ✓
- `me/SecurityPage` ✓
- `me/MyExternalBindingsPage` ✓
- `admin/settings/RolesPermissionsPage` ✓
- `admin/settings/SystemSettingsPage` ✓
- `admin/settings/SystemHealthPage` ✓
- `admin/EmailConfigPage` ✓

### B. List-as-grid (карточки в сетке)
`<Page width="regular">` + outlined cards в сетке + `<StatusPill>` для статусов.

- `courses/CoursesListPage` ✓ (regular, был narrow — исправлено)
- `admin/IntegrationsListPage` ✓ (regular + StatusPill)
- `dashboard/MyDashboardPage` ✓ (StatsPanel + regular)
- `dashboard/AdminDashboardPage` ✓ (StatsPanel + regular)
- `dashboard/TenantDashboardPage` ✓ (StatsPanel + StatusPill в таблице health)

### C. Таблицы (wide width)
`<Page width="wide">` + sparse table (no zebra, border-b на строках).

- `admin/UsersListPage` ✓
- `admin/TenantsListPage` ✓
- `admin/audit/AuditEventsPage` ✓
- `admin/audit/AuditSearchPage` ✓
- `admin/audit/AuditByActorPage` ✓
- `admin/audit/AuditByResourcePage` ✓
- `admin/audit/AuditAccessDeniedPage` ✓
- `admin/audit/AuditRetentionPolicyPage` ✓
- `admin/audit/AuditLegalHoldPage` ✓
- `admin/NotificationTemplatesPage` ✓
- `admin/NotificationDeliveriesPage` ✓
- `admin/NotificationDLQPage` ✓
- `admin/WebhooksAdminPage` ✓
- `admin/OAuthProvidersPage` ✓
- `submissions/SubmissionsListPage` ✓
- `teacher/ActivityLogPage` ✓

### D. Detail-страницы
`<Page width="regular">` + main flow + опциональный right-rail для метаданных.

- `courses/CourseDetailPage` ✓ (tabs underline + main flow)
- `assignments/AssignmentDetailPage` ✓
- `submissions/SubmissionDetailPage` ✓
- `homeworks/HomeworkDetailPage` ✓
- `admin/UserDetailPage` ✓
- `admin/TenantDetailPage` ✓
- `admin/IntegrationDetailPage` ✓
- `me/MyAssignmentDetailPage` ✓
- `me/MySubmissionDetailPage` ✓
- `plagiarism/PlagiarismRunDetailPage` ✓
- `plagiarism/PlagiarismPairDiffPage` ✓

### E. Wizard / Create-формы
`<Page width="narrow">` + один primary CTA + один выход.

- `integrations/ImportWizardPage` ✓ (4-step wizard, один выход «← Интеграции»)
- `integrations/YandexContestSetupPage` ✓
- `integrations/StepikSetupPage` ✓
- `integrations/EjudgeSetupPage` ✓
- `courses/CourseCreatePage` ✓
- `admin/UserCreatePage` ✓
- `admin/TenantCreatePage` ✓
- `admin/IntegrationCreatePage` ✓

### F. Admin-AI набор
`<Page width="regular">` + единый стиль.

- `admin/LLMProvidersPage` ✓
- `admin/LLMBudgetsPage` ✓
- `admin/LLMCacheAdminPage` ✓
- `admin/PromptVersionsPage` ✓
- `admin/AdminProvidersPage` ✓
- `admin/AdminMetricsPage` ✓

### G. Plagiarism набор
- `plagiarism/PlagiarismRunsListPage` ✓
- `plagiarism/PlagiarismCorpusPage` ✓
- `plagiarism/SuspiciousSubmissionsPage` ✓

### H. Прочие (специфичные layout'ы)

- `notifications/NotificationCenterPage` ✓ (inbox-list)
- `integrations/ImportsPage` ✓
- `me/MyAssignmentsPage` ✓
- `me/MyGradesPage` ✓
- `ai/AnalysisListPage` ✓
- `teacher/GradingQueuePage` ✓

## Страницы без `<Page>` (35 шт.) — by design

| Группа | Страницы | Почему не нужен `<Page>` |
|---|---|---|
| **Auth (full-screen centered)** | LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage, OAuthCallbackPage, TwoFactorEnrollPage, DemoLoginPage | Используют собственный full-screen layout (логотип сверху, форма по центру, links снизу). AppShell не оборачивает их. |
| **Error/Redirect** | ErrorPage, NotFoundPage, HomeRedirect, IntegrationOAuthCallbackPage | Full-screen centered либо noop-redirect. |
| **Sub-routes под Detail-страницами** | CourseSettingsPage, CourseMembersPage, CourseGroupsPage, CourseInvitationsPage, CourseStatsPage, AssignmentSettingsPage, AssignmentSubmissionsPage, AssignmentDeadlinesPage, AssignmentCreatePage, HomeworkCreatePage, HomeworkAssignmentCreatePage, JoinByCodePage, SubmissionUploadPage | Эти страницы — sub-routes (например `/courses/:slug/members`) и parent (CourseDetailPage) уже даёт `<Page>` + tabs. Заворачивать в свой `<Page>` создало бы двойной контейнер. |
| **Reporting / Sub-pages** | CourseExportsPage, ExportsListPage, GoogleSheetsLinkPage, ScheduledExportsPage, CourseDashboardPage, GlobalDashboardPage, WebPushSettingsPage, PreferencesPage | Зачастую sub-routes под `/courses/:slug/...` или `/me/notifications/...`. Тоже не нуждаются в собственном `<Page>`. |
| **Wizard sub-pages** | YandexContestImportPage | Step внутри Yandex-flow. |
| **Misc** | PlaceholderPage, CurateAsFeedbackModal (модал, не страница), SubmissionAIReportPage | Заглушка / модал / специфичный layout. |

## Точечные баги, найденные и починены вручную

| # | Файл:строка | Симптом | Фикс |
|---|---|---|---|
| 1 | `admin/settings/SystemHealthPage.tsx:49` | 500 «...reading 'map'» когда API вернул `{}` | `data?.services?.map(...)` (добавлен `?.` перед `.map`) + EmptyState когда `services` пуст |
| 2 | `admin/PromptVersionsPage.tsx:199, 206` | 500 «...reading 'length'» когда `data.data` undefined | `(data.data?.length ?? 0) === 0`, `data?.data?.map(...)` |
| 3 | `api/endpoints/notificationsAdmin.ts:140` | `DELETE /admin/notifications/dlq/{id}` → 405 (backend ожидает `:discard`) | `POST .../{id}:discard` |
| 4 | `api/endpoints/reporting.ts:362` | `PUT /courses/{id}/google-sheets-link` → 405 (backend `PATCH`) | `api.patch(...)` |
| 5 | `api/endpoints/ai.ts:268` | `useProviders()` queryFn возвращал undefined → react-query warning | tolerate bare-array и `{data:[]}` shapes, default к `[]` |

## Известные хвосты (NICE-TO-HAVE для post-КТ-1)

1. **Right-rail на 10+ detail-страниц** — `<Page>` контейнер уже добавлен, но `grid-cols-[1fr_280px]` с metadata-колонкой ещё не применён массово. CourseDetail / AssignmentDetail / UserDetail / IntegrationDetail могут получить metadata sidebar (created_at, owner, status, last activity).
2. **CoursesListPage**: master agent перевёл с narrow→regular, но visual confirmation что 6 cards в сетке корректно flow'ятся в 3 колонки на 1080px — нужен глаз.
3. **PreferencesPage matrix UI** — backend и hooks ready, UI matrix per-event не нарисован. Это feature-gap, см. `endpoint-coverage.md` section 8.

## Скрины

- Route-audit (79 страниц × 3 роли): `frontend/scripts/route-audit/`
- Redesign-verification (28 ключевых): `frontend/scripts/redesign-shots-v2/`
- Integration-smoke (26 сценарных): `frontend/scripts/integration-smoke/`

## Артефакты

- Скрипт route-audit: `frontend/scripts/route-audit.cjs`
- Скрипт integration-smoke: `frontend/scripts/integration-smoke.cjs`
- Скрипт redesign-verify: `frontend/scripts/redesign-verify-v2.cjs`
- Machine-report: `frontend/scripts/route-audit/_audit.json`
