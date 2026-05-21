# Notification Service

> Аггрегирует доменные события из Kafka и доставляет уведомления пользователям через каналы (in-app SSE / email / Telegram). Persistent (read/unread в БД, per G2). Каналы — все три (per G3). Пользователь сам настраивает preferences (per G5). Email через external transport — Mailgun/SendGrid (per G6).

**База URL префикс:** `/api/v1`

## Архитектура внутри сервиса

```
plaglens-notification/
  consumers/                # Kafka consumers — каждый сабжет на нужные топики
    submission_consumer.py
    plagiarism_consumer.py
    ai_consumer.py
    operation_consumer.py
    ...
  routers/
    rule_engine.py          # event → notification(s) на основе правил + user prefs
  channels/
    base.py                 # Channel ABC
    inapp.py                # запись в notifications + Redis pub/sub для SSE
    email.py                # Mailgun / SendGrid client
    telegram.py             # Telegram Bot API
  delivery_worker.py        # очередь Celery: notification → channel.send
  sse_server.py             # FastAPI SSE endpoint, читает Redis pub/sub
  templates/                # Jinja-шаблоны под каждый event_type × locale
```

## Сущности

```
Notification
  id, tenant_id, user_id (recipient),
  event_id (FK к Kafka event), event_type, source (service emitted),
  title, body (markdown), action_url (deep link в UI),
  severity (info/success/warning/error),
  metadata (JSON: {course_id, assignment_id, submission_id, ...}),
  created_at, read_at, archived_at,
  channels_attempted (JSONB: { inapp: "delivered", email: "failed", telegram: "skipped" })

NotificationDelivery  (per channel attempt)
  id, notification_id, channel, status (pending/sent/delivered/failed/skipped),
  error, attempted_at, delivered_at, retry_count

NotificationPreference  (per user)
  user_id (PK), channels_enabled (JSONB: { inapp: true, email: true, telegram: false }),
  email_digest_frequency (instant/hourly/daily/never),
  per_event (JSONB: { "submission.grade.assigned.v1": { inapp: true, email: false, telegram: true }, ... }),
  quiet_hours_start, quiet_hours_end, timezone

NotificationTemplate  (admin)
  id, event_type, locale, channel,
  subject_template, body_template,
  active (bool), version, created_at

EmailTransportConfig  (admin, per-tenant — но обычно глобальный)
  tenant_id (nullable), provider (mailgun/sendgrid), api_key_secret_ref,
  from_email, from_name, reply_to, dns_validated, default_for_tenant

WebPushSubscription  (опционально для Web Push API в будущем)
  user_id, endpoint, keys (auth, p256dh), user_agent, created_at
```

## Эндпоинты

### A. Notifications (read для юзера)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/notifications` | Лента уведомлений текущего юзера (filter: unread, severity, since, event_type) | bearer |
| GET | `/notifications/unread-count` | Просто число непрочитанных (для badge в UI) | bearer |
| GET | `/notifications/{id}` | Деталь | bearer (только своё) |
| PATCH | `/notifications/{id}` | `{ "read": true / false, "archived": true / false }` | bearer (своё) |
| POST | `/notifications:markAllRead` | Пометить всё прочитанным | bearer |
| POST | `/notifications:markRead` | Пометить указанные (`{ ids: [...] }`) | bearer |
| POST | `/notifications:markUnread` | Аналогично | bearer |
| DELETE | `/notifications/{id}` | Удалить (на самом деле — archive) | bearer |

### B. Real-time stream (SSE)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/notifications/stream` | SSE поток (`text/event-stream`) для текущего юзера | bearer |

SSE event-формат:
```
event: notification
id: ntf_8b7c
retry: 5000
data: {"id":"ntf_8b7c","event_type":"plagiarism.run.completed.v1",...,"action_url":"..."}

event: heartbeat
data: {"ts":"2026-05-01T10:23:45Z"}
```
- Heartbeat каждые 25s (чтобы прокси не закрывали).
- При reconnect клиент шлёт `Last-Event-ID` — мы дозабираем пропущенные из БД.

### C. Preferences

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/users/me/notification-preferences` | Текущие настройки | bearer |
| PATCH | `/users/me/notification-preferences` | Обновить (`{channels_enabled, email_digest_frequency, quiet_hours, ...}`) | bearer |
| GET | `/users/me/notification-preferences/per-event` | Настройки по типам событий | bearer |
| PATCH | `/users/me/notification-preferences/per-event` | Обновить (по одному event_type или массово) | bearer |
| POST | `/users/me/notification-preferences:reset-to-defaults` | Сбросить | bearer |
| GET | `/users/me/notification-preferences/available-events` | Список событий, на которые можно подписаться (с описанием) | bearer |

### D. Test (для отладки)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/users/me/notifications/test` | Отправить тестовое (`{channel: "email"/"telegram"/"inapp", template: "test"}`) | bearer |
| POST | `/admin/notifications/test-broadcast` | Отправить тест всем admin'ам (для проверки SMTP/TG) | admin |

### E. Templates (admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/notifications/templates` | Список (filter: event_type, locale, channel) | admin |
| GET | `/admin/notifications/templates/{id}` | Деталь | admin |
| POST | `/admin/notifications/templates` | Создать | admin |
| PATCH | `/admin/notifications/templates/{id}` | Обновить | admin |
| POST | `/admin/notifications/templates/{id}:activate` | Активировать (заменив старую версию) | admin |
| POST | `/admin/notifications/templates/{id}:preview` | Превью с подставленными data | admin |

### F. Email transport config (admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/notifications/email-config` | Текущий | admin |
| PATCH | `/admin/notifications/email-config` | Обновить (api_key через {ref-to-vault}, не plain) | admin |
| POST | `/admin/notifications/email-config:test` | Прислать тестовое | admin |
| GET | `/admin/notifications/email-config/dns-status` | Проверка SPF/DKIM/DMARC | admin |
| GET | `/admin/notifications/email-config/bounces` | Список bounces за период | admin |

### G. Telegram настройки (общий бот)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/notifications/telegram-config` | Состояние бота (token info, имя, webhook URL) | super_admin |
| PATCH | `/admin/notifications/telegram-config` | Обновить (token rotation) | super_admin |
| POST | `/admin/notifications/telegram-config:set-webhook` | Установить webhook URL Telegram'у | super_admin |

### H. Digest (агрегированные уведомления)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/admin/notifications/digest:trigger-now` | Принудительно отправить hourly/daily digest | admin |
| GET | `/users/me/notifications/digest-preview` | Превью моего следующего digest | bearer |

(Digest = аггрегация in-app уведомлений, отправляемая по email — для юзеров с `email_digest_frequency != instant`.)

### I. Web Push (опционально, для PWA)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/users/me/web-push/subscribe` | Подписать браузер | bearer |
| DELETE | `/users/me/web-push/unsubscribe` | Отписать | bearer |
| GET | `/admin/notifications/web-push/vapid-key` | Public VAPID key для frontend | bearer |

### J. Admin observability

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/notifications/deliveries` | Лента доставок (filter: status, channel, period) | admin |
| GET | `/admin/notifications/dlq` | Failed deliveries для retry/discard | admin |
| POST | `/admin/notifications/dlq/{id}:retry` | Повторить | admin |
| POST | `/admin/notifications/dlq/{id}:discard` | Отбросить | admin |
| GET | `/admin/notifications/stats` | Дашборд: per-channel delivery rate, latency | admin |

### K. Health

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Notification Service

См. `03-EVENTS.md`, секция Notification.

## События, на которые подписан Notification Service

(Краткий список — все события, на которые есть шаблон уведомления):
- `submission.submission.created.v1` (для самого студента — «принято»)
- `submission.grade.assigned.v1`, `submission.grade.changed.v1`
- `submission.feedback.added.v1` (если visible_to_student)
- `course.member.added.v1`
- `course.assignment.created.v1`, `course.assignment.deadline_changed.v1`
- `integration.import.completed.v1`, `integration.import.failed.v1`
- `plagiarism.run.completed.v1`, `plagiarism.run.failed.v1`, `plagiarism.suspicious_pair.flagged.v1`
- `ai.analysis.completed.v1`, `ai.budget.warning.v1`, `ai.budget.exceeded.v1`
- `reporting.export.completed.v1`, `reporting.export.failed.v1`
- `operation.status_changed.v1` (только для UI prompt'ов через SSE)
- `identity.user.email_verified.v1`, `identity.user.password_changed.v1`

## Метрики (специфичные)

- `notifications_created_total{event_type}`
- `notifications_delivered_total{channel, status}`
- `notifications_delivery_duration_seconds{channel}` (histogram)
- `notifications_unread_per_user` (histogram)
- `sse_active_connections{tenant_id}` (gauge)
- `email_bounces_total{type}` (`hard`, `soft`)
- `telegram_send_errors_total{error_type}`
- `digest_runs_total{frequency}`

## Реализация: критичные моменты

1. **Rule engine**: для каждого incoming event вычисляется список `(user_id, channels)`. Алгоритм:
    - Получить user_id-получателей (из event.metadata + RBAC: для assignment-events — owner+co_owner+assistants+author).
    - Для каждого user_id применить `NotificationPreference.per_event[event_type]` поверх `channels_enabled`.
    - Если все channels отключены — не создавать `Notification` вовсе.
2. **Quiet hours**: per-user `quiet_hours_start`/`_end` в его TZ — в это окно email и telegram отложены до конца окна; in-app продолжает работать.
3. **Digest**: для юзеров с `email_digest_frequency != instant` — in-app уведомления накапливаются, periodic Celery beat task собирает unread за период и шлёт один email.
4. **SSE**:
    - При подключении — auth по cookie (для refresh) или по `?access_token=` query (для compatibility).
    - Каждый сервер держит N тыс. соединений (FastAPI + uvicorn workers).
    - При отправке — Redis pub/sub channel `sse:user:{user_id}` транслирует на все pod'ы; нужный pod отправляет своему клиенту.
    - Last-Event-ID: дозабор из БД (`WHERE id > last_event_id ORDER BY id ASC LIMIT 100`).
5. **Email reliability**:
    - retries (3 попытки, exponential backoff).
    - bounces tracking — webhook от Mailgun/SendGrid → отметка в `email_bounces` таблице → при > N hard bounces юзер помечается `email_disabled`.
    - DKIM/SPF/DMARC обязательны.
6. **Telegram reliability**: при HTTP 429 от Telegram — wait `parameters.retry_after`. При `Forbidden` (юзер заблокировал бот) — отметить binding как `revoked`.
7. **Idempotent consumer**: сами consumer'ы используют `processed_events` таблицу из cross-cutting (см. `01-CROSS-CUTTING.md`).
8. **Rate limit на отправку email per user**: max 1 email/min instant + digest. Защита от шторма.
9. **Sanitization in templates**: tied to user-supplied content — display_name через Markdown-escape, links — через `urlsafe()`. CSP в HTML email.
10. **Локализация**: `NotificationTemplate` имеет `locale` (ru/en). Выбор по `User.locale`.
11. **Audit trail**: каждое creation/delivery/read пишется в Audit Service.
12. **GDPR**: при `identity.user.anonymized.v1` — все Notifications этого юзера удаляются hard.
