# PlagLens — навигационные графы по ролям

> Полные деревья достижимых экранов для каждой роли. Каждая ветвь = реальный пользовательский путь от sidebar-входа до листового экрана. Стрелка `→` обозначает клик / переход; `↪` — sidebar-меню; `⌄` — раскрытие табов внутри экрана; `⤴` — back-button в Topbar; модалки (Profile / Preferences / Help) и Logout доступны из любой страницы через нижнюю секцию sidebar.
>
> **Условные обозначения:**
> - `🟢` — entry point (sidebar)
> - `🔵` — list / index page
> - `🟡` — detail / focused page
> - `🟣` — modal / overlay
> - `📋` — form / editor
> - `🔍` — search / filter view
> - `⚙️` — settings / config
> - `🚪` — public (доступно без auth)

## 0. Публичные маршруты (до login, видны любому)

```
🚪 /login (LoginPage)
   ├── двойной клик по demo card → авто-вход
   ├── Continue with HSE SSO  → /api/v1/auth/oauth/stepik/authorize
   ├── Google / Yandex / GitHub чипы → соответствующие OAuth
   ├── E-mail + Password + Organization slug + Sign in
   ├── Remember me ✓
   ├── Forgot password? → 🚪 /auth/forgot
   ├── Нет аккаунта? → 🚪 /register
   └── Двойной клик по карточке демо-пользователя → авто-вход

🚪 /register
   └── после успешной регистрации → /login (с pre-filled email)

🚪 /auth/forgot → /auth/reset?token=… (приходит на email через Mailhog)
🚪 /auth/verify?token=…
🚪 /auth/oauth/callback?code=… (callback от Google/Yandex/Stepik/GitHub)
🚪 /demo (DemoLoginPage — расширенный список 7 demo-аккаунтов)
```

После аутентификации: `/` → `HomeRedirect` → role-based:
- student → `/me`
- teacher → `/courses`
- admin → `/admin/overview`
- super_admin → `/admin/overview`

---

## 1. Граф для роли STUDENT

### Sidebar (4 раздела «Учёба»)

```
🟢 ↪ Главная (/me)              [s_home]
🟢 ↪ Мои задания (/me/assignments)
🟢 ↪ Мои посылки (/me/submissions)
🟢 ↪ Уведомления (/me/inbox)
```

### User pill (внизу sidebar) — модалки доступны из любого экрана

```
🟣 Profile        — имя, аватар, email, телефон, 2FA, видимость
🟣 Preferences    — язык, тема, уведомления, digest, TZ, плотность, landing
🟣 Help           — список kbd-shortcuts (g+h, g+a, g+s, g+i)
🚪 Logout         — → /login
```

### Полное дерево достижимости

```
🟢 /me  (MyDashboardPage)
   ├── 🟡 раздел "Active assignments" → клик → /me/assignments/:id
   ├── 🟡 раздел "Recently graded" → клик → /me/submissions/:id
   ├── 🟡 раздел "Inbox preview" → клик → /me/inbox
   └── (топбар) языковой свитчер · тема · user pill

🟢 /me/assignments  (MyAssignmentsPage)
   ├── 🟡 row → /me/assignments/:id  (MyAssignmentDetailPage)
   │       ├── ⌄ tab "Описание" — Markdown rendering
   │       ├── ⌄ tab "Моя посылка" → /me/submissions/:lastId
   │       ├── ⌄ tab "История" — список всех версий моих посылок
   │       │       └── row → /me/submissions/:versionId
   │       ├── 📋 «Загрузить новую посылку» (Dropzone)
   │       │       → POST /api/v1/assignments/:id/submissions
   │       │       → /me/submissions/:newId  (после успеха)
   │       ├── ⤴ Topbar back → /me
   │       └── deep-link на курс → /courses/:slug (read-only)
   └── (если нет курсов) "Вступить по коду" → /courses/join/:code

🟢 /me/submissions  (SubmissionsListPage — student вариант)
   ├── 🔍 Filter: course / status / language
   ├── 🟡 row → /me/submissions/:id  (MySubmissionDetailPage)
   │       ├── ⌄ tab "Файлы"           — file tree + code viewer (syntax highlight)
   │       │       └── select file → подсветка синтаксиса
   │       ├── ⌄ tab "Оценка"           — score / max + applied multiplier (если late)
   │       ├── ⌄ tab "Комментарии"     — feedback с visible_to_student=true
   │       ├── ⌄ tab "Антиплагиат"     — ТОЛЬКО процент, без пар/имён других студентов
   │       ├── ⌄ tab "AI"              — comment ОТ преподавателя если shared_with_student=true
   │       ├── ⌄ tab "История"         — другие версии моих посылок этого задания
   │       └── ⤴ Topbar back → /me/submissions

🟢 /me/inbox  (MyInboxPage)
   ├── 🔍 Фильтры: Unread / All / Archived
   ├── 🟡 click row → action_url (динамический deep-link):
   │       ├── grade.assigned → /me/submissions/:id (Grade tab)
   │       ├── feedback.added → /me/submissions/:id (Feedback tab)
   │       ├── ai.completed   → /me/submissions/:id (AI tab)
   │       ├── plagiarism.run.completed → /me/submissions/:id (Plagiarism tab — только %)
   │       ├── course.member.added → /courses/:slug
   │       └── course.assignment.created → /me/assignments/:id
   ├── mark all read / archive selected
   └── empty-state CTA: «Открыть настройки уведомлений» → /me/notifications/preferences

══ ДОПОЛНИТЕЛЬНЫЕ ПУТИ (доступны студенту, но не в sidebar) ══

🟢 /me/profile (StudentProfilePage)
   ├── 📋 редакт. имени / locale / timezone
   ├── 📋 avatar upload (Dropzone)
   ├── deep-link → /me/security
   ├── deep-link → /me/external-bindings
   └── deep-link → /me/settings

🟢 /me/security
   ├── 📋 «Сменить пароль»
   ├── ⚙️ 2FA TOTP enroll → /me/2fa
   ├── ⚙️ link/unlink OAuth (Google / Yandex / Stepik / GitHub)
   └── 🟡 «Active sessions» — kill session / kill all but current

🟢 /me/2fa  (TwoFactorEnrollPage)
   └── QR + код подтверждения → backup codes (показываются ОДИН раз)

🟢 /me/api-keys  (MyApiKeysPage)
   ├── 📋 «Создать новый» — name + scopes
   │       → 🟣 modal с ключом (показывается ОДИН раз)
   ├── 🔄 rotate → новый ключ (старый отзывается)
   └── 🗑 revoke

🟢 /me/external-bindings  (MyExternalBindingsPage)
   └── 📋 add Stepik user_id / Yandex.Contest user_id / GitHub username

🟢 /me/exports  (ExportsListPage)
   ├── 🔍 filter: kind / status / period
   └── 🟡 row → download (signed URL TTL 5 min) / retry / cancel

🟢 /me/notifications/preferences  (PreferencesPage)
   ├── ⚙️ Channels Switch (in-app, email, telegram)
   ├── ⚙️ Per-event matrix (Notification × Channel checkboxes)
   ├── ⚙️ Quiet hours (TZ-aware)
   └── ⚙️ Digest frequency (instant / hourly / daily / never)

🟢 /me/notifications/web-push  (WebPushSettingsPage)
   └── 📋 VAPID subscribe → registered devices

🟢 /me/grades  (MyGradesPage)
   ├── 📊 KPI: всего / средний / лучший
   └── 🟡 row → /me/submissions/:id

🟢 /me/settings  (MySettingsPage — nav hub)
   ├── секция Аккаунт      → /me/profile · /me/security · /me/2fa
   ├── секция Уведомления → /me/notifications/preferences · /me/notifications/web-push · /me/inbox
   ├── секция Подключения → /me/external-bindings · /me/api-keys
   └── секция Данные      → /me/exports · /me/grades

🟢 /courses/join  и  /courses/join/:code  (JoinByCodePage)
   └── 📋 ввести код приглашения → POST /api/v1/courses:joinByCode → /courses/:slug
```

### Самые длинные ветви для студента

1. **Получить новую оценку** (через notification):
   `/me/inbox` → row "grade.assigned" → `/me/submissions/:id` → tab "Оценка" → видит балл + multiplier + feedback

2. **Загрузить и проверить посылку**:
   `/me` → row "Active assignments" → `/me/assignments/:id` → tab "Описание" → читает условие → «Загрузить новую посылку» → Dropzone → submit → 202 + Operation polling → `/me/submissions/:newId` → tab "Антиплагиат" → видит % → tab "AI" → видит comment если расшарен

3. **Проверить плагиат-статус по всем посылкам**:
   `/me/submissions` → filter `status=ready` + `language=python` → row → `/me/submissions/:id` → tab "Антиплагиат" → процент

4. **Связать Stepik-аккаунт и зайти через него**:
   `/me/settings` → секция Подключения → `/me/external-bindings` → 📋 add Stepik user_id → submit → logout → `/login` → "Continue with Stepik SSO" → callback → авторизован

---

## 2. Граф для роли TEACHER

Преподаватель видит **больше**, чем студент: workspace + tools + course-scoped roles (owner / co_owner / assistant в каждом курсе свои).

### Sidebar (2 раздела × 6+3 пунктов)

```
🟢 Workspace
  ↪ Курсы (/courses)
  ↪ Задания (/me/assignments)        — список заданий по своим курсам
  ↪ Посылки (/me/submissions)        — все посылки во всех курсах teacher'а
  ↪ Отчёты (/reports → /me/exports)
  ↪ Импорты (/imports)
  ↪ Активность (/activity)

🟢 Tools
  ↪ Интеграции (/integrations)
  ↪ LLM-провайдер (/llm)
  ↪ Настройки (/settings)
```

### Полное дерево

```
🟢 /courses  (CoursesListPage)
   ├── greeting "Good morning, Anya."
   ├── 4 KPI: Awaiting verdict / Checks in progress / Processed this week / Median similarity
   ├── 🟡 click course row → /courses/:slug
   ├── 🔍 search assignments / status filter / language filter
   ├── 📋 «+ New course» → /courses/new
   └── для каждой секции курса:
       └── click assignment row → /assignments/:id

🟡 /courses/:slug  (CourseDetailPage)
   ├── header: name + slug + status pill + member count
   ├── ⌄ tab "ДЗ" (default) — список HwRow'ов (Homework hierarchy)
   │       └── click → /courses/:slug/homeworks/:hwSlug
   ├── ⌄ tab "Участники" → /courses/:slug/members
   ├── ⌄ tab "Группы" → /courses/:slug/groups
   ├── ⌄ tab "Приглашения" → /courses/:slug/invitations
   ├── ⌄ tab "Stats" → /courses/:slug/stats
   ├── (правый dropdown) Settings, Duplicate, Archive/Restore
   ├── 📋 «+ Новое ДЗ» → /courses/:slug/homeworks/new
   ├── deep-link «Дашборд» → /courses/:slug/dashboard (если права)
   ├── deep-link «Экспорты» → /courses/:slug/exports
   ├── deep-link «Расписание» → /courses/:slug/scheduled-exports
   ├── deep-link «Google Sheets» → /courses/:slug/google-sheets
   ├── deep-link «Подозрительные» → /courses/:slug/suspicious
   └── ⤴ Topbar back → /courses

🟡 /courses/:slug/homeworks  (HomeworkListPage)
   ├── 🔵 список ДЗ курса (HomeworkRow per ДЗ)
   ├── 📋 «+ Новое ДЗ» → /courses/:slug/homeworks/new
   └── click row → /courses/:slug/homeworks/:hwSlug

🟡 /courses/:slug/homeworks/new  (HomeworkCreatePage)
   ├── 📋 form: hwSlug, title, description (MD), deadline_soft, deadline_hard, weight
   └── submit → /courses/:slug/homeworks/:newHwSlug

🟡 /courses/:slug/homeworks/:hwSlug  (HomeworkDetailPage)
   ├── header: title + course slug + deadline pill
   ├── ⌄ tab "Задания" (default) — список AsgRow'ов под этим ДЗ
   │       └── click → /assignments/:id
   ├── ⌄ tab "Описание" — Markdown rendering
   ├── ⌄ tab "Дедлайн ДЗ" — soft + hard, late multiplier
   ├── ⌄ tab "Статистика ДЗ" — submissions, avg score, plagiarism summary
   ├── 📋 «+ Новое задание» → /courses/:slug/homeworks/:hwSlug/assignments/new
   └── ⤴ Topbar back → /courses/:slug

🟡 /courses/:slug/homeworks/:hwSlug/assignments/new  (AssignmentCreatePage — under ДЗ)
   ├── 📋 form: slug, title, description (MD), language, max_score, weight,
   │       deadlines (soft + hard), late_score_multiplier, selection_strategy,
   │       plagiarism_auto_run + threshold, ai_auto_run, external_bindings
   └── submit → /assignments/:newId  (assignment.homework_id = :hwSlug parent)

🟡 /courses/:slug/settings  (CourseSettingsPage)
   ├── 📋 edit: name, description (Markdown), start/end_date, settings JSON
   └── danger zone: delete (soft)

🟡 /courses/:slug/members  (CourseMembersPage)
   ├── 🔍 filter by role (owner / co_owner / assistant / student)
   ├── 📋 «Добавить участника» (search-by-email)
   ├── 📋 «Bulk invite» (textarea email list, role select)
   ├── per row → 🗑 remove / 📋 change role / transfer to group
   └── 🟡 user-row → /admin/users/:id (если admin может)

🟡 /courses/:slug/groups  (CourseGroupsPage)
   ├── 📋 «Создать группу» (name + capacity)
   ├── per group → 📋 add students / 🔄 transfer between groups
   └── per group → 🗑 delete

🟡 /courses/:slug/invitations  (CourseInvitationsPage)
   ├── 📋 «Создать код приглашения» (single-use или multi-use)
   ├── per invitation → copy link / revoke
   └── show used_count / max_uses / expires_at

🟡 /courses/:slug/stats  (CourseStatsPage)
   ├── KPI cards: enrolled_students, assignments_count, submissions_total, avg_score
   ├── histogram оценок (recharts BarChart)
   ├── per-assignment averages line chart
   ├── plagiarism stats (% suspicious, max sim, language breakdown)
   ├── AI usage donut (cache hit rate)
   └── timeline (weekly submission count)

🟡 /courses/:slug/dashboard  (CourseDashboardPage — owner+co_owner+assistant)
   ├── ⌄ tabs: Overview / Grades / Plagiarism / AI / Timeline / Languages / Activity / Late
   ├── tab "Late" → list of late submissions → click → /submissions/:id
   └── tab "Activity" → embedded ActivityRow's

🟡 /courses/:slug/exports  (CourseExportsPage)
   ├── 🔵 list of past exports (CSV/XLSX/JSON/PDF/Sheets)
   ├── 📋 modal «Создать экспорт» → 202 Operation → download
   └── per row → retry / cancel / delete

🟡 /courses/:slug/scheduled-exports  (ScheduledExportsPage)
   ├── 🔵 list cron schedules (form: cron + format + scope + target)
   ├── 📋 «Создать расписание»
   └── per row → run-now / disable / delete

🟡 /courses/:slug/google-sheets  (GoogleSheetsLinkPage)
   ├── 📋 link existing spreadsheet (id + sheet_name + columns_mapping)
   ├── «Test connection»
   └── «Manual sync now» → 202 Operation

🟡 /courses/:slug/suspicious  (SuspiciousSubmissionsPage)
   ├── 🔍 filter: severity / assignment / dismissed/active
   └── click row → /submissions/:id (и сразу tab "Plagiarism")

🟡 /courses/:slug/assignments/new  (AssignmentCreatePage — legacy fallback)
   ├── (deprecated standalone path; preferred: /courses/:slug/homeworks/:hwSlug/assignments/new)
   ├── 📋 form: slug, title, description (MD), language, max_score, weight,
   │       deadlines (soft + hard), late_score_multiplier, selection_strategy,
   │       plagiarism_auto_run + threshold, ai_auto_run, external_bindings,
   │       + homework_id (optional — иначе attached to default homework)
   └── submit → /assignments/:newId

🟡 /assignments/:id  (AssignmentDetailPage)
   ├── header: title + course code + ДЗ parent (homework_id) + state pill + last-checked
   ├── 1.6/1fr two-column layout:
   │   ├── LEFT: description + tabs (submissions / stats / settings / plagiarism / AI)
   │   │   ├── ⌄ tab "Submissions" → submissions list
   │   │   │       └── click → /submissions/:id
   │   │   ├── ⌄ tab "Plagiarism" → embedded или → /assignments/:id/plagiarism
   │   │   └── ⌄ tab "AI"  → /assignments/:id/ai-analyses
   │   └── RIGHT: Quick stats + Recent runs + Actions
   ├── 🔘 «Run new check» → POST plagiarism-run → 202 → /plagiarism-runs/:newRunId
   ├── 🔘 «Open similarity report» → /plagiarism-runs/:latestRunId
   ├── 🔘 «Settings» → /assignments/:id/settings
   ├── 🔘 «Submissions» → /assignments/:id/submissions
   ├── 🔘 «Deadlines» → /assignments/:id/deadlines
   ├── 🔘 «Upload submission» (на student-аккаунте) → /assignments/:id/upload
   ├── (action menu) Duplicate / Archive / Publish / Delete
   └── ⤴ Topbar back → /courses/:slug

🟡 /assignments/:id/settings  (AssignmentSettingsPage)
   └── 📋 full edit form + grading_config (rubric JSON, pass_threshold, visibility_at)

🟡 /assignments/:id/submissions  (AssignmentSubmissionsPage)
   ├── 🔍 filter: author / status / late / suspicious / language
   ├── columns: author / version / submitted_at / late tag / suspicious flag / score
   ├── bulk actions: batchUpdate grades (CSV), batchPublish feedback, batchSelect
   └── click row → /submissions/:id

🟡 /assignments/:id/deadlines  (AssignmentDeadlinesPage)
   ├── 📋 «Продлить дедлайн» (per-user) — student select + new deadlines + reason
   └── 🟡 «Отменить продление»

🟡 /assignments/:id/upload  (SubmissionUploadPage — student variant)
   └── (только если teacher грузит от имени студента) Dropzone

🟡 /submissions/:id  (SubmissionDetailPage)
   ├── header: author + assignment + version + submitted_at + late badge + suspicious badge
   ├── ⌄ tab "Files"      — file tree + code viewer (syntax highlight)
   ├── ⌄ tab "Grade"      — выставление оценки (score, comment_visible_to_student) + history
   ├── ⌄ tab "Feedback"  — список Markdown-комментариев + publish/unpublish
   ├── ⌄ tab "Plagiarism" — % + список пар + click pair → /plagiarism-runs/:runId/pairs/:pairId
   ├── ⌄ tab "AI"         — full LLM report + «Curate as feedback» modal + share with student toggle
   ├── ⌄ tab "Flags"     — manual flag set/clear (suspicious/llm_attention/manual)
   ├── ⌄ tab "History"   — все версии по (assignment_id, author_id)
   └── ⤴ Topbar back → /assignments/:id

🟡 /assignments/:id/plagiarism  (PlagiarismRunsListPage)
   ├── 🔵 список запусков (provider, status, max_sim, pairs_total, pairs_suspected)
   ├── 📋 modal «Запустить новую проверку» (provider + with_corpus + threshold + options)
   └── click run → /plagiarism-runs/:runId

🟡 /plagiarism-runs/:runId  (PlagiarismRunDetailPage)
   ├── header: meta + StatusPill + 6-up KPI cards
   ├── ⌄ tabs: Pairs / Clusters / Artifacts / Cross-course
   │   ├── tab "Pairs" — table OR card-list (Segmented toggle)
   │   │       ├── 🔍 filter: min_similarity slider, cross_course toggle
   │   │       └── click pair → /plagiarism-runs/:runId/pairs/:pairId
   │   ├── tab "Clusters" — cluster cards (если provider дал)
   │   ├── tab "Artifacts" — download HTML / JSON / archive (signed URLs)
   │   └── tab "Cross-course" — cross-tenant pairs (corpus matches)
   ├── 🔘 «Cancel» / «Retry»
   └── ⤴ Topbar back → /assignments/:id

🟡 /plagiarism-runs/:runId/pairs/:pairId  (PlagiarismPairDiffPage)
   ├── header: A author ↔ B author + similarity %
   ├── two-pane code diff (sticky author headers + fragment-zone highlight)
   ├── horizontal FragmentChip strip (toggle visibility per fragment)
   ├── ⌨️ ↑/↓ keyboard navigation between fragments
   ├── (per pair) link → /submissions/:aId  и  /submissions/:bId
   └── ⤴ Topbar back → /plagiarism-runs/:runId

🟡 /assignments/:id/ai-analyses  (AnalysisListPage)
   ├── 🔵 table: submission, author, status, model, tokens_used, cost
   ├── 📋 «Запустить batch» → POST :batchCreate → 202 → polling
   └── click row → /submissions/:submissionId/ai-report

🟡 /submissions/:id/ai-report  (SubmissionAIReportPage)
   ├── header: status, provider, model, tokens, cost, cache_hit badge
   ├── summary (Markdown) + risk_signals (Badge per type+severity) + questions + recommendations
   ├── 🔘 «Сгенерировать заново» (выбор prompt_version + force_no_cache)
   ├── 🔘 «Создать комментарий из отчёта» → 🟣 CurateAsFeedbackModal
   │       └── on submit → POST :curate-as-feedback → /submissions/:id (Feedback tab)
   ├── 🔘 «Поделиться со студентом» / «Скрыть»
   ├── 🟡 history accordion: previous regenerations
   └── ⤴ Topbar back → /assignments/:id

══ Workspace · второй уровень ══

🟢 /me/assignments       — same view as student (если teacher's в каком-то курсе ещё и student)
🟢 /me/submissions  (SubmissionsListPage — teacher вариант, cross-course feed)
   ├── 🔍 Course Segmented (All / каждый курс)
   ├── 🔍 Status Segmented (All / Flagged / Running / Checked)
   ├── columns: author + course + assignment + attempts + verdict + similarity %
   └── click → /submissions/:id

🟢 /reports → /me/exports  (ExportsListPage)
   └── (см. выше)

🟢 /imports  (ImportWizardPage)
   ├── 4-step wizard: Source → Auth → Course mapping → Run
   ├── Sources: Stepik / Yandex.Contest / Manual ZIP
   ├── при OAuth → redirect → /api/v1/integrations/:id/oauth/start
   ├── после connect → POST :sync → 202 Operation
   └── 🟡 status: ImportJob row → /admin/integrations/:id или /integrations

🟢 /activity  (ActivityLogPage)
   ├── 🔍 filter: All / Run / Import / Verdict / LLM
   └── timeline rows: timestamp + actor + description + meta

══ Tools · sidebar Tools ══

🟢 /integrations  (IntegrationsListPage — teacher)
   ├── 🔵 connected (left col) + available (right col)
   ├── 📋 «Connect» Stepik / YaContest / GitHub / Moodle
   └── click row → 🟡 /admin/integrations/:id (если есть права; иначе teacher-scope view)

🟢 /llm  (LLMProvidersPage — teacher view)
   ├── selected provider info card + token usage chart
   └── (далее только admin может менять — переход на /admin/ai/providers)

🟢 /settings  (TopLevelSystemSettingsPage)
   └── (для teacher: сокращённый — только personal preferences,
        admin видит расширенный tenant settings)

══ КРОСС-ССЫЛКИ И NOTIFICATION-DRIVEN PATHS ══

(SSE bell сверху → click → /notifications или action_url)

  notification "plagiarism.run.completed.v1" → /plagiarism-runs/:runId
  notification "ai.budget.warning.v1"        → /admin/ai/budgets (если admin)
  notification "submission.suspicious_pair"  → /courses/:slug/suspicious
  notification "integration.import.completed"→ /admin/integrations/:id или /imports
```

### Самые длинные ветви teacher'а

1. **Полный verdict-flow от уведомления до подписи**:
   bell → `/notifications` → row "plagiarism.run.completed" → `/plagiarism-runs/:runId` → tab "Pairs" → click pair → `/plagiarism-runs/:runId/pairs/:pairId` → ↓ через 5 fragment'ов → back → `/submissions/:aId` → tab "AI" → «Curate as feedback» → modal → submit → tab "Grade" → выставить балл → publish → ↩ back → ↩ back → ↩ back → `/courses/:slug/suspicious` → mark dismissed → ⤴ → `/courses`

   **Глубина: 7 экранов, 12 действий.**

2. **Создать курс → создать задание → импортировать посылки → проверить → выставить оценки**:
   `/courses` → «New course» → `/courses/new` → submit → `/courses/:slug` → tab "Members" → bulk invite → tab "Assignments" → «New assignment» → `/courses/:slug/assignments/new` → submit → `/assignments/:id` → «Submissions» tab → (ещё пусто) → ↩ → sidebar `/imports` → wizard 4 steps → connect Stepik OAuth → callback → sync → polling 202 → ↩ → `/assignments/:id/submissions` → 5 student rows → click → `/submissions/:id` → grade → ↩ → ↩ → видно average на `/courses/:slug/dashboard`.

   **Глубина: 8 экранов, 18 действий.**

3. **Cross-course corpus search**:
   `/courses/:slug` → tab "Stats" → click plagiarism segment → `/courses/:slug/dashboard` → tab "Plagiarism" → «Cross-course alerts» → `/plagiarism-runs/:id` (run with_corpus) → tab "Cross-course" → видит pair с другим курсом → ↩ → разбирательство.

---

## 3. Граф для роли ADMIN (tenant administrator)

Admin видит ВСЁ что teacher + tenant management. Сидбар у admin **ДРУГОЙ** (не teacher-вариант).

### Sidebar (2 раздела)

```
🟢 Учреждение (Tenant)
  ↪ Обзор (/admin/overview)
  ↪ Пользователи (/admin/users)
  ↪ Журнал (/admin/audit)

🟢 Система (System)
  ↪ Интеграции (/admin/integrations)
  ↪ Настройки учреждения (/admin/system/settings)
```

(В реальности admin может navigate-ом дойти до всего, что есть у teacher — `/courses`, `/assignments/...` etc., потому что RoleGuard'ы на этих route'ах принимают `admin`.)

### Полное дерево admin-разделов

```
🟢 /admin/overview  (AdminDashboardPage)
   ├── greeting + tenant name
   ├── 4 KPI: active users / active courses / pending sync errors / monthly LLM tokens
   ├── 🟡 «System health» rows → /admin/system/health
   ├── 🟡 «Recent admin activity» → click → /admin/audit/events/:id
   └── deep-links:
       ├── → /admin/users
       ├── → /admin/integrations
       ├── → /admin/audit
       ├── → /admin/exports
       ├── → /admin/providers
       ├── → /admin/metrics
       ├── → /admin/ai/providers
       ├── → /admin/ai/budgets
       └── → /admin/plagiarism-corpus

🟢 /admin/users  (UsersListPage)
   ├── 🔍 filter: role / status / search (q)
   ├── 📋 «+ Создать»
   │       ├── single → /admin/users/new
   │       └── bulk-invite → 🟣 modal
   ├── 🟡 row → /admin/users/:id  (UserDetailPage)
   │       ├── ⌄ tab "Profile" — display_name, email, locale, role
   │       ├── ⌄ tab "External" — bindings (Stepik / YaContest)
   │       ├── ⌄ tab "OAuth" — linked Google / Yandex / Stepik / GitHub
   │       ├── ⌄ tab "Sessions" — active sessions + kill
   │       ├── ⌄ tab "API keys"  — список + revoke
   │       ├── ⌄ tab "Audit"     → embedded /admin/audit/actors/:userId
   │       ├── action menu: disable / enable / anonymize (irreversible) / reset password / force-logout
   │       └── ⤴ Topbar back → /admin/users
   └── 🔘 bulk actions: invite / anonymize / force-logout

🟢 /admin/users/new  (UserCreatePage)
   ├── 📋 single user form
   └── tab "Bulk invite" — paste email list, role select

🟢 /admin/audit  (AuditEventsPage)
   ├── 🔍 filter: actor / action / resource_type / result / time range
   ├── 🟡 row expand → JSON before/after diff
   ├── deep-links:
   │   ├── → /admin/audit/search (full-text + aggregations chart)
   │   ├── → /admin/audit/access-denied (security review — все 403's)
   │   ├── → /admin/audit/retention (retention policy edit)
   │   └── → /admin/audit/legal-holds
   └── per row → /admin/audit/actors/:userId  ИЛИ  /admin/audit/resources/:type/:id

🟢 /admin/audit/search  (AuditSearchPage)
   ├── 🔍 query + filters
   ├── 📊 aggregations bar chart (recharts)
   └── result list → click → /admin/audit/events/:id

🟢 /admin/audit/actors/:userId
   └── timeline всех действий конкретного user'а

🟢 /admin/audit/resources/:type/:id
   └── timeline событий по ресурсу

🟢 /admin/audit/access-denied  (AuditAccessDeniedPage)
   └── список 403's — security review

🟢 /admin/audit/retention  (AuditRetentionPolicyPage)
   ├── 📋 edit retention_default_days / long_retention_days
   └── ⚙️ toggle legal_hold_active

🟢 /admin/audit/legal-holds  (AuditLegalHoldPage)
   ├── 🔵 list active holds
   ├── 📋 «Создать hold» (resource_id + reason)
   └── 🗑 «Снять hold»

🟢 /admin/integrations  (IntegrationsListPage — admin)
   ├── 🔍 kind / status filters
   ├── 📋 «+ Новая интеграция» → /admin/integrations/new
   ├── deep-link → /admin/integrations/webhooks (incoming events log)
   └── 🟡 row → /admin/integrations/:id  (IntegrationDetailPage)
           ├── ⌄ tab "Settings" — credentials, params
           ├── ⌄ tab "OAuth state" — re-auth, refresh
           ├── ⌄ tab "Schedules" — cron CRUD
           ├── ⌄ tab "Sync history" — ImportJob list → click → operation status
           ├── 🔘 «Test connection» / «Manual sync now»
           └── 🔘 «Toggle enabled/disabled» / «Delete»

🟢 /admin/integrations/new  (IntegrationCreatePage — wizard)
   ├── pick kind: Stepik / Yandex.Contest / Manual / Telegram / Google Sheets
   ├── 📋 config form per kind
   ├── OAuth flow if needed (start → callback)
   └── save → /admin/integrations/:id

🟢 /admin/integrations/webhooks  (WebhooksAdminPage)
   ├── 🔍 filter by kind (stepik/yandex/plagiarism/llm/telegram)
   ├── 🔵 list of WebhookEvent'ов (signature_valid badge, processed status)
   └── 🔘 «Retry» / «Discard» on failed

🟢 /admin/notifications/email  (EmailConfigPage)
   ├── 📋 transport (SMTP / Mailgun) selector
   ├── 📋 from_email, from_name, reply_to
   ├── 🔘 «Send test email»
   └── 🟡 «DNS status» — SPF/DKIM/DMARC check

🟢 /admin/notifications/templates  (NotificationTemplatesPage)
   ├── 🔍 filter: event_type / locale / channel
   ├── 🟡 row → 🟣 modal с edit form
   ├── preview rendered HTML/text
   ├── activate / deactivate
   └── compare versions

🟢 /admin/notifications/deliveries  (NotificationDeliveriesPage)
   ├── 🔍 filter: status / channel / period
   └── 🟡 row → details (recipient, content, attempts)

🟢 /admin/notifications/dlq  (NotificationDLQPage)
   ├── 🔵 list of failed deliveries
   └── 🔘 «Retry» / «Discard»

🟢 /admin/system/settings  (SystemSettingsPage)
   ├── секция System info (version, build, uptime — read-only)
   ├── секция Auth (SSO config, 2FA enforcement)
   ├── секция Privacy (retention, GDPR-ready toggles)
   ├── секция AI / LLM (default provider, budget caps)
   └── секция Health checks (выводит health для всех 10 сервисов)

🟢 /admin/system/health  (SystemHealthPage)
   ├── /v1/services-status агрегированно
   ├── per-service status card (green / yellow / red)
   └── recent errors timeline

🟢 /admin/roles  (RolesPermissionsPage — read-only matrix)
   └── полная матрица всех ролей × permissions

🟢 /admin/exports  (admin export pane)
   ├── 🔵 list of all tenant exports
   ├── 🔍 filter: tenant / period / kind / format
   └── system-level batches (audit_log export, tenant_usage)

🟢 /admin/providers  (AdminProvidersPage — combined view)
   ├── секция LLM tiles → /admin/ai/providers / /admin/ai/budgets / /admin/ai/prompt-versions
   ├── секция Антиплагиат tiles → /admin/plagiarism-corpus
   ├── секция Email tiles → /admin/notifications/email / /admin/notifications/templates
   └── секция OAuth tiles → /admin/integrations

🟢 /admin/metrics  (AdminMetricsPage)
   ├── tile per сервис (10 сервисов) с health
   ├── KPI: tokens, cost, active users, courses
   └── external dashboards: Grafana / Prometheus / Jaeger / Kafka UI (открываются в новой вкладке)

🟢 /admin/ai/providers  (LLMProvidersPage — admin)
   ├── 🔵 list of ProviderConfig
   ├── 📋 «+ Add provider» (modal: base_url, model, api_key_env_var, priority, rate_limit_rpm)
   ├── per row → 🔄 toggle enabled / set default / 🧪 test / ✏️ edit (modal с syncing on open)
   └── 🟡 row → details → request log

🟢 /admin/ai/prompt-versions  (PromptVersionsPage)
   ├── 🔵 list versions
   ├── 📋 «+ New version» (system prompt + user template + json schema)
   ├── per row → activate / 🧪 sandbox test (paste code → preview)
   └── usage stats per version

🟢 /admin/ai/budgets  (LLMBudgetsPage)
   ├── 📋 tenant-level budget (max_tokens / max_cost / period)
   ├── 📋 per-course budgets
   ├── 📊 usage progress bars
   └── 📊 history chart (recharts)

🟢 /admin/ai/cache  (LLMCacheAdminPage)
   ├── 📊 cache hit rate stats + size
   ├── 🔘 «Purge by prompt version»
   ├── 🔘 «Purge by submission»
   └── 🔘 «Purge entire cache»

🟢 /admin/plagiarism-corpus  (PlagiarismCorpusPage)
   ├── 📊 corpus stats per tenant (entries, languages distribution)
   ├── 🔘 «Rebuild fingerprint index» → 202 Operation → polling
   ├── 🟡 click course row → /courses/:slug
   └── 🔘 «Search similar to specific submission»
```

### Самые длинные ветви admin'а

1. **Подключить новый LMS-провайдер end-to-end и убедиться что импорт работает**:
   `/admin/overview` → tile «Integrations» → `/admin/integrations` → «+ Новая» → wizard step 1 (Stepik) → step 2 (OAuth start) → callback → step 3 (course mapping) → step 4 (test sync) → save → `/admin/integrations/:id` → tab "Sync history" → click ImportJob → operation polling → success → `/courses` → see imported posylki → `/admin/integrations/webhooks` → check signature_valid

   **Глубина: 9 экранов.**

2. **Расследовать security incident по audit-логу**:
   bell → notification "rbac.access_denied" → `/admin/audit` → filter `result=failure` → click `/admin/audit/access-denied` → identify suspicious user → click → `/admin/audit/actors/:userId` → see all their actions → click suspicious resource → `/admin/audit/resources/submission/:id` → `/submissions/:id` → → → `/admin/users/:id` → tab "Sessions" → kill all → `/admin/audit/legal-holds` → create hold for resource → submit → `/admin/users/:id` → action «Anonymize» (с предупреждением) → confirm.

   **Глубина: 11 экранов.**

3. **Configure LLM end-to-end**:
   `/admin/overview` → `/admin/providers` → tile "LLM" → `/admin/ai/providers` → «+ Add» → form: OpenRouter base_url + model + api_key_env_var=`OPENROUTER_API_KEY` → save → 🧪 test → green → set default → `/admin/ai/budgets` → tenant budget = 50M tokens/mo → save → `/admin/ai/prompt-versions` → «+ New v2» → edit prompt → activate → `/admin/ai/cache` → check hit rate → 🔘 purge old version cache.

   **Глубина: 6 экранов, 9 действий.**

4. **Настроить email-канал и проверить bounce-handling**:
   `/admin/notifications/email` → switch transport SMTP → Mailgun → fill API key + domain → save → 🔘 «Send test email» → check Mailhog/Mailgun → проверить delivered → `/admin/notifications/templates` → найти template `submission.grade.assigned` → preview → tweak Markdown → save → `/admin/notifications/deliveries` → filter status=failed → /admin/notifications/dlq → retry / discard → проверить bounce policy: `/admin/system/settings` → секция Privacy → `email_hard_bounces_threshold = 3`.

   **Глубина: 5 экранов.**

---

## 4. Граф для роли SUPER_ADMIN

Super_admin = admin + cross-tenant + создание тенантов + global dashboard. Sidebar тот же что у admin, но с 3 дополнительными разделами:

### Доп. разделы (видны только super_admin)

```
🟢 /admin/tenants  (TenantsListPage)
   ├── 🔵 cross-tenant список
   ├── 📋 «+ New tenant» → /admin/tenants/new
   └── 🟡 row → /admin/tenants/:id  (TenantDetailPage)
           ├── ⌄ tab "Settings" — name, domain, cors_origins, default_provider
           ├── ⌄ tab "Users" → /admin/users (filter tenant=:id)
           ├── ⌄ tab "Usage" — KPI per tenant
           ├── ⌄ tab "Audit" — embedded /admin/audit?tenant=:id
           ├── 🔘 «Suspend» / «Activate»
           └── 🔘 «Delete» (hard) — confirm dialog

🟢 /admin/tenants/new  (TenantCreatePage)
   └── 📋 form: slug, name, domain, plan, cors_origins, owner_email

🟢 /admin/dashboard/global  (GlobalDashboardPage)
   ├── cross-tenant метрики
   ├── тренд по всем тенантам
   ├── top tenants by usage
   └── система-уровень alerts

🟢 /admin/dashboard/tenant/:id  (TenantDashboardPage — для конкретного tenant с cross-tenant контекстом)
```

### Самые длинные ветви super_admin'а

1. **Создать новый tenant и привязать SSO**:
   `/admin/dashboard/global` → top-right «+ New tenant» → `/admin/tenants/new` → submit → `/admin/tenants/:id` → tab "Settings" → set CORS + domain + plan → save → tab "Users" → `/admin/users` (filter tenant=:newId) → «Bulk invite» admin user → email landing → `/login` (под админом нового тенанта) → all admin paths now scoped to new tenant.

2. **Cross-tenant security forensics**:
   `/admin/dashboard/global` → spike in 403's → `/admin/audit/access-denied` (X-Cross-Tenant header) → identify problem tenant → `/admin/tenants/:id` → suspend → `/admin/audit/actors/:user` → investigate → `/admin/users/:id` (cross-tenant) → anonymize.

---

## 5. Универсальные cross-cutting экраны

Эти доступны из любой страницы любой роли:

```
🟣 User pill → menu (4 пункта)
   ├── 🟣 Profile modal       — name (RU/EN), email, phone, 2FA, visibility
   ├── 🟣 Preferences modal   — language, theme, email-notif, digest, TZ, density, landing
   ├── 🟣 Help modal          — список kbd-shortcuts (per role)
   └── 🚪 Logout              — POST /api/v1/auth/logout → / → /login

🔔 Header bell → SSE-driven dropdown
   ├── unread count badge
   ├── recent 10 notifications
   ├── click notification → action_url (см. notification-driven paths выше)
   ├── mark-all-read
   └── «Open all» → /notifications или /me/inbox

⌘K Sidebar search (Cmd+K)
   └── поиск по: курсам / заданиям / посылкам / студентам

⌨️ Keyboard shortcuts (work on all pages):
   ├── g + c   → /courses (teacher) / /me/inbox (student)
   ├── g + a   → /me/assignments
   ├── g + s   → /me/submissions
   ├── g + d   → /reports
   ├── g + i   → /me/exports / /imports (teacher)
   ├── g + h   → role-based home
   ├── g + o   → /admin/overview (admin)
   ├── g + u   → /admin/users (admin)
   ├── g + l   → /admin/audit (admin)
   ├── ?       → 🟣 Help modal
   ├── Esc     → закрыть текущую модалку
   └── ↑/↓    → шаг по фрагментам в diff-viewer
```

---

## 6. Сводная таблица (entry points by role)

| Sidebar | Student | Teacher | Admin | Super_admin |
|---|---|---|---|---|
| Главная | ✓ /me | ✓ /courses | ✓ /admin/overview | ✓ /admin/overview |
| Задания / Курсы | ✓ /me/assignments | ✓ /courses | (через courses) | ↗ |
| Посылки | ✓ /me/submissions | ✓ /me/submissions | ↗ | ↗ |
| Уведомления | ✓ /me/inbox | bell only | bell only | bell only |
| Отчёты | — | ✓ /reports | (через courses) | ↗ |
| Импорты | — | ✓ /imports | (через admin/integrations) | ↗ |
| Активность | — | ✓ /activity | ✓ /admin/audit | ↗ |
| Интеграции | — | ✓ /integrations | ✓ /admin/integrations | ↗ |
| LLM | — | ✓ /llm | ✓ /admin/ai/providers | ↗ |
| Settings | — | ✓ /settings | ✓ /admin/system/settings | ↗ |
| Пользователи | — | (per-course) | ✓ /admin/users | ✓ |
| Tenants | — | — | — | ✓ /admin/tenants |
| Global dashboard | — | — | — | ✓ /admin/dashboard/global |
| Audit log | — | — | ✓ /admin/audit | ✓ (cross-tenant) |
| Providers | — | view only | ✓ /admin/providers | ↗ |
| Metrics | — | — | ✓ /admin/metrics | ↗ |

---

## 7. Запутанные («длинные») паттерны навигации

### A. "Notification → дотыкаться до root cause"

```
SSE bell push → /notifications → click row → /me/submissions/:id (для student)
                                          → /submissions/:id (для teacher) → tab "AI" → curate-as-feedback → modal → submit → tab "Feedback" → publish → ↩ back × N → root sidebar
```

### B. "Plagiat-flow до verdict"

```
/courses → course row → /courses/:slug → assignment row → /assignments/:id
  → «Run plagiarism» → 202 → /plagiarism-runs/:newId (polling)
  → tab "Pairs" → pair row → /plagiarism-runs/:runId/pairs/:pairId
    → ↑/↓ steps fragments
    → click "Open submission A" → /submissions/:aId
      → tab "Grade" → set score=0, comment_visible=true → publish → ↩
    → ↩ → click "Open submission B" → /submissions/:bId
      → tab "Flags" → manual flag «suspicious»
    → ↩ × 3 → /courses/:slug/suspicious → mark dismissed
```

### C. "Tenant onboarding (super_admin → admin → teacher → student)"

```
super_admin: /admin/tenants/new → submit → /admin/tenants/:id → invite admin → switch to admin
admin: /login → /admin/overview → /admin/integrations → connect Stepik OAuth → /admin/users → bulk invite teachers → switch
teacher: /login → /courses → «New course» → /courses/:slug/members → bulk invite students → /imports → wizard 4 steps → submission flow
student: /login → /me → /me/assignments → upload submission → check grade
```

---

## 8. Точки расхождения граф'ов

Один и тот же URL может рендериться **по-разному** в зависимости от роли:

| URL | Student | Teacher | Admin |
|---|---|---|---|
| `/me/submissions` | свои посылки | cross-course feed для всех своих курсов | cross-tenant feed (если super_admin) |
| `/courses/:slug` | read-only view + только свои submissions | full edit + member mgmt | tenant-wide (если admin) |
| `/submissions/:id` | tabs: Files/Grade(visible only)/Feedback(visible only)/Plagiarism(% only)/AI(shared only)/History | full tabs incl. Flags + Curate-as-feedback | full + audit context |
| `/integrations` | — (404) | teacher-scope (per-course integrations) | tenant-scope (all tenant integrations) |
| `/llm` | — | view-only provider info | full edit + budgets + cache admin |

Источник:
- RoleGuard'ы в `frontend/src/routes/index.tsx`
- Server-side RBAC в Identity service + per-resource checks в Course/Submission/etc

См. `docs/architecture/02-RBAC.md` для полной permission matrix.
