# Integration Service

> Объединяет KT-1 «Stepik Adapter», «Yandex Contest Adapter», «Telegram Bot», «Google Sheets» в один сервис с pluggable adapter'ами. Так же отвечает за приём входящих webhook'ов и за расписания периодических импортов.

**База URL префикс:** `/api/v1`

## Архитектура внутри сервиса

```
plaglens-integration/
  adapters/
    base.py            # IntegrationAdapter ABC
    stepik.py          # OAuth + polling
    yandex_contest.py  # OAuth + polling
    manual.py          # Manual ZIP / individual file
    telegram.py        # Outbound + inbound (webhook от Telegram)
    google_sheets.py   # Service account → Sheets API
  pollers/             # Celery beat tasks per integration kind
  webhooks/            # FastAPI endpoints для входящих
  scheduling/          # Cron registration
```

`IntegrationAdapter` интерфейс:
```python
class IntegrationAdapter(Protocol):
    kind: Literal["stepik", "yandex_contest", "manual", ...]
    async def test_connection(self, config: IntegrationConfig) -> ConnectionStatus: ...
    async def list_remote_courses(self, config) -> list[RemoteCourse]: ...
    async def import_submissions(self, config, scope, since: datetime | None) -> ImportResult: ...
    async def handle_webhook(self, payload: bytes, headers: dict) -> list[DomainEvent]: ...
```

## Сущности

```
IntegrationConfig
  id, tenant_id, course_id (nullable: tenant-wide или per-course),
  kind (stepik / yandex_contest / manual / telegram / google_sheets),
  display_name,
  status (pending_auth / active / disabled / error),
  credentials_secret_ref (Vault path),
  settings (JSON: kind-specific)
  cursor (JSON: kind-specific, e.g. { "last_imported_at": "..." })
  last_sync_at, last_sync_status, last_sync_error,
  created_by, created_at, updated_at, deleted_at

ImportJob
  id, integration_id, scope (JSON: course/assignment/range), trigger (manual/scheduled/webhook),
  status (queued/running/completed/failed), progress (JSON),
  started_at, finished_at, stats (JSON: { imported, skipped, failed }),
  error (JSON: Problem)

SyncSchedule
  id, integration_id, cron, scope (JSON), enabled, last_run_at, next_run_at, created_at

WebhookEvent
  id, integration_id (nullable), kind (stepik/telegram/plagiarism/llm), payload_hash, signature_valid,
  received_at, processed_at, status (received/processed/ignored/failed),
  raw_payload_uri (S3)

TelegramBinding
  id, user_id, chat_id, username (display), bound_at, verification_token (during bind)

GoogleSheetsLink
  id, course_id, spreadsheet_id, sheet_name, columns_mapping (JSON), updated_at, created_by
```

## Эндпоинты

### A. Integration Configs

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations` | Список (filter: tenant, course, kind, status) | admin / owner / co_owner |
| POST | `/integrations` | Создать config | admin / owner / co_owner |
| GET | `/integrations/{id}` | Деталь | admin / owner / co_owner |
| PATCH | `/integrations/{id}` | Обновить settings | admin / owner / co_owner |
| DELETE | `/integrations/{id}` | Удалить (с предупреждением: потеряются cursor/токены) | admin / owner |
| POST | `/integrations/{id}:test` | Проверить соединение (вызов adapter.test_connection) | admin / owner / co_owner |
| POST | `/integrations/{id}:enable` | Включить | admin / owner |
| POST | `/integrations/{id}:disable` | Отключить | admin / owner |

**`POST /integrations`** (пример для Stepik)
```json
{
  "kind": "stepik",
  "course_id": "crs_42",
  "display_name": "Stepik: Алгоритмы 2026",
  "settings": {
    "auth_method": "oauth",          // или "static_token"
    "stepik_course_ids": ["56789"],
    "import_only_after": "2026-02-01T00:00:00Z"
  }
}
```
- 201 + `Location: /v1/integrations/{id}` + `oauth_authorize_url` если нужен OAuth flow.

### B. OAuth flow (для интеграций)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations/{id}/oauth/start` | Получить authorize_url + state | admin / owner / co_owner |
| GET | `/integrations/{id}/oauth/callback` | Callback от провайдера (`?code=&state=`) | public (state-validated) |
| POST | `/integrations/{id}/oauth/refresh` | Принудительный refresh токена | admin / owner |
| DELETE | `/integrations/{id}/oauth/disconnect` | Отвязать (отозвать токены, status → pending_auth) | admin / owner |

OAuth provider'ы для Integration Service: Stepik, Я.Контест, Google (для Sheets — но обычно через сервисный аккаунт, не OAuth).

### C. Stepik-specific endpoints

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations/stepik/{config_id}/courses` | Видимые Stepik-курсы (вызов Stepik API) | admin / owner / co_owner |
| GET | `/integrations/stepik/{config_id}/courses/{stepik_course_id}/lessons` | Уроки | admin / owner / co_owner |
| GET | `/integrations/stepik/{config_id}/courses/{stepik_course_id}/steps?type=code` | Только code-steps | admin / owner / co_owner |
| GET | `/integrations/stepik/{config_id}/steps/{stepik_step_id}/preview` | Превью step (description) | admin / owner / co_owner |
| POST | `/integrations/stepik/{config_id}/sync-course-structure` | Импортировать структуру курса (создать assignments автоматом) | admin / owner / co_owner |

### D. Yandex.Contest-specific endpoints

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations/yandex-contest/{config_id}/contests` | Видимые контесты | admin / owner / co_owner |
| GET | `/integrations/yandex-contest/{config_id}/contests/{contest_id}/problems` | Задачи | admin / owner / co_owner |
| GET | `/integrations/yandex-contest/{config_id}/contests/{contest_id}/participants` | Участники | admin / owner / co_owner |
| POST | `/integrations/yandex-contest/{config_id}/sync-contest-structure` | Импортировать структуру | admin / owner / co_owner |

### E. Manual import (CSV / ZIP)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/integrations/manual/upload` | Загрузить ZIP с посылками (multipart) | teacher / assistant |
| POST | `/integrations/manual/upload-csv` | Загрузить CSV (`student_email,language,file_url или встроенный код`) | teacher / assistant |
| GET | `/integrations/manual/templates` | Скачать шаблон CSV для конкретного курса/задания | teacher / assistant |

ZIP-конвенция:
```
upload.zip
  /assignment_slug/
    /student@email.com/
      main.py
      utils.py
```
Адаптер парсит структуру, маппит email → `User`, складывает Submissions.

### F. Sync — запуск импорта

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/integrations/{id}/sync` | Запустить полный (или инкрементальный) импорт. Body: `{ scope: {course_id?, assignment_id?, since?}, force_full: bool }` | admin / owner / co_owner |
| GET | `/integrations/{id}/import-jobs` | Список jobs этой интеграции | admin / owner / co_owner |
| GET | `/integrations/{id}/import-jobs/{job_id}` | Деталь | admin / owner / co_owner |
| POST | `/integrations/{id}/import-jobs/{job_id}:cancel` | Отменить | admin / owner / co_owner |
| POST | `/integrations/{id}/import-jobs/{job_id}:retry` | Перезапустить упавший | admin / owner / co_owner |

`POST /integrations/{id}/sync` возвращает `202 Accepted` + Operation.

### G. Sync schedules (cron-like)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations/{id}/schedules` | Список | admin / owner / co_owner |
| POST | `/integrations/{id}/schedules` | Создать (`{ cron: "0 */6 * * *", scope, enabled }`) | admin / owner / co_owner |
| GET | `/integrations/{id}/schedules/{schedule_id}` | Деталь | admin / owner / co_owner |
| PATCH | `/integrations/{id}/schedules/{schedule_id}` | Обновить | admin / owner / co_owner |
| DELETE | `/integrations/{id}/schedules/{schedule_id}` | Удалить | admin / owner / co_owner |
| POST | `/integrations/{id}/schedules/{schedule_id}:run-now` | Принудительно сейчас | admin / owner / co_owner |

### H. Telegram

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/integrations/telegram/binding/start` | Старт привязки: возвращает `verification_token` (юзер вводит в боте) | bearer |
| POST | `/integrations/telegram/binding/confirm` | Подтвердить (системный, после `/start <token>` в боте) | internal |
| GET | `/users/me/telegram-binding` | Состояние привязки | bearer |
| DELETE | `/users/me/telegram-binding` | Отвязать | bearer |
| GET | `/admin/integrations/telegram/bot-settings` | Настройки бота (token info, name) | admin |
| PATCH | `/admin/integrations/telegram/bot-settings` | Обновить (только super_admin для bot token) | super_admin |

(Сам Telegram bot token хранится в Vault, общий для платформы.)

### I. Google Sheets

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations/google-sheets/spreadsheets` | Список доступных spreadsheets (через сервисный аккаунт) | admin / owner |
| POST | `/courses/{id}/google-sheets/link` | Привязать spreadsheet к курсу (`{spreadsheet_id, sheet_name, columns_mapping}`) | owner / co_owner |
| GET | `/courses/{id}/google-sheets/link` | Текущая привязка | owner / co_owner / assistant |
| PATCH | `/courses/{id}/google-sheets/link` | Обновить | owner / co_owner |
| DELETE | `/courses/{id}/google-sheets/link` | Отвязать | owner / co_owner |
| POST | `/courses/{id}/google-sheets/link:validate` | Проверить — есть ли права у service account на этот sheet | owner / co_owner |

(Реальный экспорт в Sheets — через Reporting Service, см. `11-REPORTING.md`. Здесь — только привязка.)

### J. Webhooks (входящие)

Все webhook-эндпоинты — **public**, защита через подпись/секрет в headers.

| Method | Path | Описание |
|---|---|---|
| POST | `/webhooks/stepik/{tenant_id}` | Webhook от Stepik (если он будет — сейчас polling) |
| POST | `/webhooks/yandex-contest/{tenant_id}` | Webhook от Я.Контест |
| POST | `/webhooks/telegram` | Update от Telegram (привязка, команды) |
| POST | `/webhooks/plagiarism/{provider}/{run_id}` | Callback от антиплагиат-провайдера (если поддерживает; сейчас — нет) |
| POST | `/webhooks/llm/{provider}` | Async callback от LLM (если используется batch API типа OpenAI Batch) |

**Стандарт обработки webhook:**
1. Верификация подписи (HMAC-SHA256 по shared-secret из Vault).
2. Валидация `event_id` — если уже обработан, возврат 200.
3. Сохранение raw payload в `WebhookEvent` + S3 (для аудита).
4. Возврат 200 OK как можно быстрее (≤2 секунд).
5. Реальная обработка — в Celery-таск, который читает `WebhookEvent`.

### K. Cursor management (admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/integrations/{id}/cursor` | Текущий cursor | admin / owner |
| POST | `/integrations/{id}/cursor:reset` | Сбросить (полный реимпорт) | admin / owner |
| POST | `/integrations/{id}/cursor:set` | Поставить вручную (`{value}`) | admin |

### L. Stats и health

| Method | Path | Описание |
|---|---|---|
| GET | `/admin/integrations/health` | Статус всех интеграций тенанта |
| GET | `/admin/integrations/webhook-events` | Лента входящих webhook-событий (для отладки) |
| GET | `/admin/integrations/dlq` | DLQ для упавших import jobs |

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Integration Service

См. `03-EVENTS.md`, секция Integration.

## События, на которые подписан Integration Service

- `course.assignment.created.v1` → если у задания указано `external_bindings`, проверяет, есть ли активная интеграция, и регистрирует задание для импорта.
- `course.course.deleted.v1` → отключает intgrations этого курса.
- `identity.tenant.deleted.v1` → отключает все integrations тенанта.

## Метрики (специфичные)

- `integration_imports_total{kind, result}` — `success` / `failed` / `partial`
- `integration_imports_duration_seconds{kind}` (histogram)
- `integration_imported_submissions_total{kind, source}`
- `integration_dedup_skips_total{kind}`
- `integration_external_api_calls_total{kind, endpoint}`
- `integration_external_api_errors_total{kind, error_type}`
- `integration_active_oauth_tokens{kind}` (gauge)
- `integration_webhook_events_total{kind, status}`
- `integration_schedule_runs_total{schedule_id, result}`

## Реализация: критичные моменты

1. **Stepik adapter** — polling каждые N минут (cron в SyncSchedule). Запрос: `GET /api/submissions?step={id}&time__gt={cursor}&page=N`. Цикл по страницам, пока `meta.has_next`. После каждой успешной страницы — обновление `cursor.last_imported_at`.
2. **Yandex.Contest adapter** — аналогично, но cursor может быть `(contest_id, max_run_id)`. Используем подтверждённый user'ом API (D4).
3. **OAuth токены** — refresh_token в Vault (`secret/integrations/{config_id}/refresh_token`), access_token в Redis (TTL = expires_in - 60s). При экспирации — adapter сам refresh'ит.
4. **Идемпотентность импорта** — Submission Service дедупит по `(source, external_id)`. Integration Service может ретраить страницу безопасно.
5. **Backpressure**: лимит на параллельные import jobs per tenant (default 3) — чтобы не выжечь rate-limit внешнего API.
6. **Manual upload** — после сохранения ZIP'а в S3, Celery-таск разбирает его, парсит структуру, создаёт submissions через Submission Service API.
7. **Telegram bot** — отдельный долгоживущий процесс (aiogram) внутри сервиса, подписан на updates через webhook (если домен публичный) или long-polling (development). Команды: `/start <token>` (привязка), `/unbind`, `/help`.
8. **Webhook signature verification** — для Stepik (если будет) HMAC по `secret = config.settings.webhook_secret`. Для Telegram — IP allowlist Telegram'а + `secret_token` в Update.
9. **Manifest schema для CSV-import** — публичный JSON Schema, доступный по `GET /integrations/manual/templates/csv-schema.json`.
10. **Schedule-driven imports** — Celery beat читает `SyncSchedule` (БД-backed beat scheduler типа `celery-redbeat`), и при наступлении `next_run_at` ставит задачу в очередь.
