# Reporting Service

> Объединяет KT-1 «Export Service» и «Dashboard Service». Отвечает за генерацию экспортов (CSV, XLSX, JSON, PDF, Google Sheets) и за все агрегированные дашборды/аналитику. Per H1 — все форматы. Per H3 — Google Sheets как обновление привязанной таблицы. Per H5 — дашборды нужны.

**База URL префикс:** `/api/v1`

## Архитектура внутри сервиса

```
plaglens-reporting/
  exports/
    formats/
      csv.py
      xlsx.py        # openpyxl с условным форматированием
      json.py
      pdf.py         # reportlab или WeasyPrint (HTML→PDF)
      google_sheets.py
    builders/
      assignment_grades.py
      course_summary.py
      plagiarism_report.py
      ai_analysis_summary.py
      audit_log.py
    workers.py       # Celery tasks
  dashboards/
    course_dashboard.py
    tenant_dashboard.py
    global_dashboard.py
    aggregator.py    # денормализованные read-models из Kafka
  read_models/       # таблицы-проекции для быстрых дашбордов
```

## Сущности

```
ExportJob
  id, tenant_id, kind (assignment_grades / course_summary / plagiarism_report / ...),
  scope (JSON: {course_id?, assignment_id?, period?, filters?}),
  format (csv/xlsx/json/pdf/google_sheets),
  status (queued/running/completed/failed/cancelled),
  options (JSON: {include_columns, with_feedback, ...}),
  artifact_uri (S3, nullable пока не done),
  artifact_size_bytes, artifact_format, artifact_filename,
  expiry_at,                         -- 30 дней по умолчанию, потом cleanup
  triggered_by, started_at, finished_at, error (Problem nullable), created_at

GoogleSheetsLink  (живёт в Integration Service; здесь только используем)

ScheduledExport
  id, course_id, kind, format, target (file_download / google_sheets),
  cron, scope (JSON), enabled, last_run_at, next_run_at, created_by, created_at

DashboardSnapshot  (опционально, для тяжёлых аггр.)
  id, scope (course_id/tenant_id), kind (overview/grades/plagiarism/ai),
  data (JSONB), generated_at, expires_at

ReadModel.CourseStats  (read-model, обновляется по событиям)
  course_id (PK),
  enrolled_students, assignments_count, submissions_total,
  average_score, plagiarism_alerts_count, ai_runs_count, ai_tokens_used,
  last_activity_at, updated_at

ReadModel.AssignmentStats
  assignment_id (PK),
  submissions_count, students_submitted_count,
  on_time_count, late_soft_count, late_hard_count,
  average_score, max_similarity, suspicious_count, ai_completed_count, updated_at

ReadModel.TenantStats
  tenant_id (PK),
  active_courses, active_users, submissions_30d,
  ai_tokens_total_30d, ai_cost_total_30d, plagiarism_runs_30d, updated_at

ReadModel.UserGradesSummary
  (user_id, course_id) (PK),
  assignments_total, submissions_total, average_score,
  on_time_rate, suspicious_count, updated_at
```

## Эндпоинты

### A. Exports — запуск

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/courses/{id}/exports` | Экспорт курса | teacher / assistant |
| POST | `/assignments/{id}/exports` | Экспорт задания | teacher / assistant |
| POST | `/plagiarism-runs/{id}/exports` | Экспорт plagiat-отчёта | teacher / assistant |
| POST | `/admin/exports/audit` | Экспорт аудита | admin |
| POST | `/admin/exports/tenant-usage` | Биллинговый отчёт по тенанту | admin |
| POST | `/exports` | Generic export (`{kind, scope, format, options}`) — для редких случаев | teacher+ |

**`POST /assignments/{id}/exports`**
```json
{
  "kind": "assignment_grades",
  "format": "xlsx",
  "options": {
    "include_columns": ["author", "score", "submitted_at", "language", "similarity", "ai_summary"],
    "include_late_marks": true,
    "include_feedback_visible": true,
    "include_all_versions": false,
    "language_filter": null
  }
}
```
- 202 Accepted + Operation. Эмитит `reporting.export.started.v1`.
- Идемпотентность по `Idempotency-Key`.

### B. Exports — read

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/exports` | Все мои экспорты (filter: kind, status, scope) | bearer |
| GET | `/exports/{id}` | Деталь | бывш-инициатор / admin / teacher для своего курса |
| GET | `/exports/{id}/download` | Скачать (signed URL TTL 5 мин) | то же |
| DELETE | `/exports/{id}` | Удалить (soft) | инициатор / admin |
| POST | `/exports/{id}:retry` | Перезапустить упавший | инициатор / admin |
| POST | `/exports/{id}:cancel` | Отменить | инициатор / admin |
| GET | `/courses/{id}/exports` | Все экспорты курса | owner / co_owner / assistant |

### C. Google Sheets — обновление привязанной таблицы

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/courses/{id}/exports/google-sheets/sync` | Синхронизировать данные курса в привязанный sheet | owner / co_owner / assistant |
| GET | `/courses/{id}/exports/google-sheets/last-sync` | Когда последняя | owner / co_owner / assistant |
| POST | `/assignments/{id}/exports/google-sheets/sync` | Per-assignment синхронизация | owner / co_owner / assistant |

`POST /courses/{id}/exports/google-sheets/sync` — асинхронная задача, обновляет указанные листы привязанной spreadsheet. Колонки определяются `GoogleSheetsLink.columns_mapping`.

### D. Scheduled exports

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/scheduled-exports` | Список расписаний | owner / co_owner |
| POST | `/courses/{id}/scheduled-exports` | Создать (`{kind, format, target, cron, scope}`) | owner / co_owner |
| GET | `/courses/{id}/scheduled-exports/{schedule_id}` | Деталь | owner / co_owner |
| PATCH | `/courses/{id}/scheduled-exports/{schedule_id}` | Обновить | owner / co_owner |
| DELETE | `/courses/{id}/scheduled-exports/{schedule_id}` | Удалить | owner / co_owner |
| POST | `/courses/{id}/scheduled-exports/{schedule_id}:run-now` | Принудительно сейчас | owner / co_owner |

### E. Dashboards — Course

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/dashboard` | Overview (главная) | course member |
| GET | `/courses/{id}/dashboard/grades-distribution` | Гистограмма распределения оценок | teacher / assistant |
| GET | `/courses/{id}/dashboard/grades-by-assignment` | Средние и медианы | teacher / assistant |
| GET | `/courses/{id}/dashboard/plagiarism-stats` | % посылок с suspicious flag, max sim, runs over time | teacher / assistant |
| GET | `/courses/{id}/dashboard/ai-usage` | Токены / стоимость / runs | owner / co_owner |
| GET | `/courses/{id}/dashboard/timeline` | Активность по неделям | teacher / assistant |
| GET | `/courses/{id}/dashboard/active-students` | Лист активных за период | teacher / assistant |
| GET | `/courses/{id}/dashboard/stragglers` | Студенты, которые отстают (мало посылок, плохие оценки) | teacher / assistant |
| GET | `/courses/{id}/dashboard/late-submissions` | Поздние посылки | teacher / assistant |
| GET | `/courses/{id}/dashboard/language-breakdown` | Распределение по языкам | teacher / assistant |

### F. Dashboards — Tenant

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/tenants/{id}/dashboard` | Tenant-level overview | admin |
| GET | `/tenants/{id}/dashboard/active-courses` | Активные курсы | admin |
| GET | `/tenants/{id}/dashboard/active-users` | Активные юзеры (DAU / MAU) | admin |
| GET | `/tenants/{id}/dashboard/integrations-health` | Состояние всех интеграций | admin |
| GET | `/tenants/{id}/dashboard/ai-usage` | Tenant-level бюджет и использование | admin |
| GET | `/tenants/{id}/dashboard/storage-usage` | MinIO usage per курс | admin |

### G. Dashboards — Global (super_admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/dashboard/global` | Cross-tenant overview | super_admin |
| GET | `/admin/dashboard/system-health` | Состояние всех сервисов | super_admin |
| GET | `/admin/dashboard/operations` | Все runs/jobs за период | super_admin |
| GET | `/admin/dashboard/errors` | Топ-ошибок | super_admin |

### H. Аналитика для студента (self)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/me/dashboard` | Мой обзор (мои курсы, средняя оценка, upcoming deadlines) | bearer |
| GET | `/users/me/courses/{id}/grades-summary` | Мои оценки по курсу | bearer + member |
| GET | `/users/me/progress` | Прогресс по семестру | bearer |

### I. Read-model инвалидация (admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/admin/reporting/read-models:rebuild` | Полный rebuild всех read-models тенанта | admin |
| POST | `/admin/reporting/read-models/{name}:rebuild` | Только конкретный | admin |
| GET | `/admin/reporting/read-models/health` | Лаг от событийного потока | admin |

### J. Audit lookup (proxy в Audit, для удобства frontend'а — Reporting часто строит views с аудитом)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/courses/{id}/recent-activity` | Последние события курса (proxy) | teacher / assistant |
| GET | `/users/me/recent-activity` | Моя лента | bearer |

### K. Health

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Reporting

См. `03-EVENTS.md`, секция Reporting.

## События, на которые подписан Reporting Service

Reporting — основной consumer событий из всех сервисов, чтобы поддерживать read-models актуальными:
- `submission.submission.created.v1` → `+1` к `AssignmentStats.submissions_count`
- `submission.grade.assigned.v1` / `.changed.v1` → пересчёт averages
- `plagiarism.run.completed.v1` → обновление `plagiarism_alerts_count`
- `plagiarism.suspicious_pair.flagged.v1` → `+1`
- `ai.analysis.completed.v1` → `+tokens` к counters
- `ai.budget.exceeded.v1` → flag в дашборде
- `course.course.created.v1` / `.archived.v1` → `TenantStats.active_courses`
- `integration.import.completed.v1` → `+submissions_imported`
- `identity.user.deleted.v1` / `.anonymized.v1` → пересчёт user-related

## Метрики (специфичные)

- `reporting_exports_total{kind, format, status}`
- `reporting_exports_duration_seconds{kind, format}` (histogram)
- `reporting_export_size_bytes{format}` (histogram)
- `reporting_dashboard_requests_total{dashboard}`
- `reporting_dashboard_cache_hit_rate{dashboard}`
- `reporting_read_model_lag_seconds{model}` (gauge)
- `reporting_google_sheets_syncs_total{result}`
- `reporting_scheduled_runs_total{result}`

## Реализация: критичные моменты

1. **Async export всегда**: даже маленькие CSV — через Operation. Для UI — после создания operation сразу можно открывать `result_url` (он 404 пока не done, потом редиректит на signed URL).
2. **Read-models** — отдельные таблицы в БД Reporting Service (можно schema `reporting_read`). Обновляются Kafka-consumer'ами, идемпотентно по `event_id`.
3. **Дашборды кэшируются** в Redis (TTL 5 минут для overview, 1 минута для детальных). Инвалидация — по событиям соответствующих сущностей.
4. **PDF generation**: HTML-шаблон (Jinja) → WeasyPrint. Для отчётов с code блоками — Pygments highlighting.
5. **XLSX**: openpyxl, условное форматирование (красные ячейки для suspicious, late, низкие оценки).
6. **CSV**: UTF-8 BOM + экранирование (для Excel совместимости).
7. **JSON**: streaming output для больших экспортов (через iterator).
8. **Google Sheets sync**: использует google-api-python-client + service account. Updates применяются через `batchUpdate` для эффективности (max 100 ячеек per request).
9. **Storage**: артефакты в MinIO `plaglens-{tenant}/exports/{yyyy}/{mm}/{export_id}.{ext}`. Cleanup-job (ежедневный) удаляет файлы старше 30 дней (`expiry_at` < now).
10. **Signed URLs**: генерируются с TTL 5 минут на каждый GET `/exports/{id}/download` — нет hot-link'ов.
11. **Скоупинг**: read-models тегированы `tenant_id`; запросы автоматически фильтруются.
12. **Tenant dashboard performance**: не считаем on-the-fly — только из read-models. Запрос-aggregate вне read-models триггерит `403 SLOW_QUERY_DENIED` или сваливается в очередь как scheduled report.
13. **Личные данные в экспортах**: PDF/XLSX содержат имена студентов; Google Sheets — тоже. Анонимизация — опция в `options.anonymize: true`, тогда вместо имён — `student_001` и т.д.
14. **Идемпотентность scheduled-runs**: ключ `(schedule_id, period_start)` — если уже сгенерирован за этот период, не генерируем повторно.
