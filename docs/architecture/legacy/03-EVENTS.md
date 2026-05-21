# Шина событий: Kafka topics и контракты

> PlagLens использует Kafka как шину доменных событий. Назначение: асинхронная связность между сервисами, аудит, fan-out на уведомления и аналитику. HTTP-вызовы между сервисами оставляются только для **read-cross-service**, когда event'ы не подходят (например, синхронная авторизация).

## 1. Конвенции топиков

```
plaglens.{service}.{domain}.{version}
```

Примеры:
- `plaglens.identity.user.v1`
- `plaglens.course.assignment.v1`
- `plaglens.submission.submission.v1`
- `plaglens.plagiarism.run.v1`

Партиционирование — по `tenant_id` (для tenant-локальной упорядоченности) если иное не указано.

## 2. Конверт события (CloudEvents-compatible)

```json
{
  "specversion": "1.0",
  "id": "evt_01HF8K9X...",
  "type": "plaglens.submission.submission.created.v1",
  "source": "/services/submission",
  "subject": "submissions/sub_8b7c",
  "time": "2026-05-01T10:23:45.123Z",
  "datacontenttype": "application/json",
  "tenant_id": "tnt_hse_cs",
  "actor": { "type": "user", "id": "usr_42", "role": "owner" },
  "trace_id": "01HF8K9...",
  "data": {
    "submission_id": "sub_8b7c",
    "assignment_id": 123,
    "author_id": "usr_77",
    "language": "python",
    "version": 1
  }
}
```

Идентификаторы:
- `id` — уникальный, используется consumer'ами для дедупликации.
- `trace_id` — корреляция с HTTP-запросом или job, который сгенерировал событие.

## 3. Регистр событий

> Полная таблица. `Owner` — сервис-публикатор. `Subscribers` — сервисы-консьюмеры (могут добавляться без согласования с owner'ом).

### Identity (`plaglens.identity.user.v1`, `plaglens.identity.tenant.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `identity.tenant.created.v1` | Identity | Audit, Reporting | Создан новый тенант |
| `identity.user.registered.v1` | Identity | Notification, Audit, Reporting | Пользователь зарегистрировался |
| `identity.user.email_verified.v1` | Identity | Notification, Audit | Email подтверждён |
| `identity.user.password_changed.v1` | Identity | Notification, Audit | Пароль изменён |
| `identity.user.role_assigned.v1` | Identity | Audit | Назначена глобальная роль |
| `identity.user.deleted.v1` | Identity | Audit, Submission, Reporting | User soft-deleted |
| `identity.user.anonymized.v1` | Identity | Audit, Submission, Plagiarism, AI | GDPR-anonymize |
| `identity.session.created.v1` | Identity | Audit | Login |
| `identity.session.revoked.v1` | Identity | Audit | Logout / force kick |

### Course (`plaglens.course.course.v1`, `plaglens.course.assignment.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `course.course.created.v1` | Course | Audit, Reporting | Создан курс |
| `course.course.updated.v1` | Course | Audit | Изменён |
| `course.course.archived.v1` | Course | Audit, Reporting | Архивирован |
| `course.course.deleted.v1` | Course | Audit, Submission, Plagiarism, AI | Soft delete |
| `course.member.added.v1` | Course | Notification, Audit | Добавлен участник |
| `course.member.role_changed.v1` | Course | Audit | Изменена course role |
| `course.member.removed.v1` | Course | Notification, Audit | Удалён |
| `course.assignment.created.v1` | Course | Notification, Reporting | Создано задание |
| `course.assignment.updated.v1` | Course | Audit | Изменено задание |
| `course.assignment.deadline_changed.v1` | Course | Notification | Изменён дедлайн |
| `course.assignment.deleted.v1` | Course | Submission, Plagiarism, AI | Soft delete |

### Submission (`plaglens.submission.submission.v1`, `plaglens.submission.grade.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `submission.submission.created.v1` | Submission | Plagiarism, AI, Notification, Audit, Reporting | Новая посылка (любой источник) |
| `submission.submission.deleted.v1` | Submission | Audit | Soft delete |
| `submission.grade.assigned.v1` | Submission | Notification, Audit, Reporting | Выставлена оценка |
| `submission.grade.changed.v1` | Submission | Notification, Audit | Изменена |
| `submission.grade.removed.v1` | Submission | Audit | Снята |
| `submission.feedback.added.v1` | Submission | Notification, Audit | Добавлен комментарий |

### Integration (`plaglens.integration.import.v1`, `plaglens.integration.config.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `integration.config.created.v1` | Integration | Audit | Настроена интеграция |
| `integration.config.updated.v1` | Integration | Audit | Изменена |
| `integration.config.deleted.v1` | Integration | Audit | Удалена |
| `integration.import.started.v1` | Integration | Audit, Notification | Импорт запущен |
| `integration.import.progress.v1` | Integration | Notification | Прогресс импорта (для SSE) |
| `integration.import.completed.v1` | Integration | Plagiarism, AI, Notification, Audit | Импорт завершён успешно |
| `integration.import.failed.v1` | Integration | Notification, Audit | Импорт упал |
| `integration.webhook.received.v1` | Integration | Audit | Получен webhook от внешней системы |

### Plagiarism (`plaglens.plagiarism.run.v1`, `plaglens.plagiarism.report.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `plagiarism.run.queued.v1` | Plagiarism | Notification, Audit | Запуск проверки в очереди |
| `plagiarism.run.started.v1` | Plagiarism | Notification | Воркер взял в работу |
| `plagiarism.run.progress.v1` | Plagiarism | Notification | Прогресс (если провайдер даёт) |
| `plagiarism.run.completed.v1` | Plagiarism | Notification, AI, Reporting, Audit | Готов отчёт |
| `plagiarism.run.failed.v1` | Plagiarism | Notification, Audit | Ошибка |
| `plagiarism.report.published.v1` | Plagiarism | Reporting | Отчёт сохранён |
| `plagiarism.suspicious_pair.flagged.v1` | Plagiarism | Notification, Audit | Найдена подозрительная пара (sim > threshold) |

### AI Analysis (`plaglens.ai.analysis.v1`, `plaglens.ai.budget.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `ai.analysis.queued.v1` | AI Analysis | Notification, Audit | LLM-задача в очереди |
| `ai.analysis.started.v1` | AI Analysis | Notification | Запрос к LLM начался |
| `ai.analysis.completed.v1` | AI Analysis | Notification, Audit | Структурированный отчёт сохранён |
| `ai.analysis.failed.v1` | AI Analysis | Notification, Audit | Ошибка / превышен budget |
| `ai.analysis.cache_hit.v1` | AI Analysis | Reporting | Был кэш-хит (для метрик) |
| `ai.budget.warning.v1` | AI Analysis | Notification | Достигнут soft-cap (80%) |
| `ai.budget.exceeded.v1` | AI Analysis | Notification, Audit | Достигнут hard-cap (100%) |

### Notification (`plaglens.notification.delivery.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `notification.created.v1` | Notification | Audit | Уведомление создано |
| `notification.delivered.v1` | Notification | Audit | Доставлено в канал |
| `notification.failed.v1` | Notification | Audit | Не доставлено |
| `notification.read.v1` | Notification | — | Прочитано пользователем |

### Reporting (`plaglens.reporting.export.v1`)

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `reporting.export.started.v1` | Reporting | Notification, Audit | Экспорт запущен |
| `reporting.export.completed.v1` | Reporting | Notification, Audit | Готов файл |
| `reporting.export.failed.v1` | Reporting | Notification, Audit | Ошибка |

### Operation lifecycle (`plaglens.operation.v1`) — общий

| Type | Owner | Subscribers | Когда |
|---|---|---|---|
| `operation.status_changed.v1` | сервис, владеющий operation | Notification (для SSE) | Любая смена статуса операции |

## 4. Идемпотентность consumer'ов

Каждый сервис-консьюмер хранит таблицу:

```sql
CREATE TABLE processed_events (
    event_id TEXT PRIMARY KEY,
    consumer_group TEXT NOT NULL,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON processed_events (consumed_at);
```

Retention: 7 дней (cron-job чистит старые). Если событие приходит повторно с тем же `event_id` — обработка skip.

## 5. Schema evolution

- Добавление optional поля → не breaking, в той же `.v1`
- Добавление required поля или удаление поля → новый `.v2` топик; параллельная публикация на оба ≥1 спринт; consumer'ы мигрируют, потом `.v1` отключается.
- Все схемы хранятся в репозитории `plaglens-events-schema/` (json-schema), publishing CI-проверяется на совместимость.

## 6. Dead-letter queue (DLQ)

- Каждый consumer-group имеет DLQ-топик `{original_topic}.dlq.v1`.
- После 5 неудачных retry с экспоненциальным backoff (1s → 2s → 5s → 15s → 60s) — событие летит в DLQ.
- DLQ читается админами через Reporting Service эндпоинт `GET /v1/admin/dlq?topic=...`.

## 7. SSE bridge (для real-time)

Notification Service подписан на ключевые событийные топики и проксирует их клиентам через SSE:
- `operation.status_changed.v1` → клиент видит прогресс импорта/проверок
- `plagiarism.run.completed.v1` → пуш на UI
- `submission.grade.assigned.v1` → пуш студенту

Связь:
```
Kafka topic → Notification Service consumer → Redis pub/sub channel `sse:user:{user_id}` → SSE connection
```
