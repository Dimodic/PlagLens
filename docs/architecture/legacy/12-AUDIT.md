# Audit Service

> Централизованный append-only аудит-журнал. Принимает события из всех сервисов (через Kafka topic `plaglens.audit.event.v1` + при необходимости через HTTP write-API), хранит их с retention, предоставляет read-API.

**База URL префикс:** `/api/v1`

## Сущности

```
AuditEvent
  id (ULID, монотонно возрастающий),
  tenant_id (nullable: системные события без тенанта),
  occurred_at, recorded_at,
  actor (JSON: { type: user/system/integration, id, role }),
  action (string, e.g. "submission.created", "user.password_changed", "course.member_role_changed",
          "plagiarism.run_started", "auth.login_failed", "auth.login_success", "rbac.access_denied",
          "tenant.deleted", "data_export.created"),
  resource (JSON: { type, id, parent_id?, parent_type? }),
  result (success/failure),
  source_service (identity/course/...),
  request_id (correlation),
  ip, user_agent,
  before (JSON nullable, before-state for changes — diff-driven),
  after (JSON nullable, after-state),
  metadata (JSON: специфичные поля per action),
  retention_class (default/long/legal_hold)

RetentionPolicy
  scope (system/tenant), scope_id,
  default_retention_days (e.g. 365), long_retention_days (e.g. 2555 = 7 лет),
  legal_hold_active (bool), updated_at, updated_by

LegalHold
  id, scope (resource_id), reason, started_at, ended_at, requested_by
```

## Эндпоинты

### A. Read API

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/audit/events` | Лента событий тенанта (filter: actor, action, resource_type, resource_id, since, until, result) | admin |
| GET | `/audit/events/{id}` | Деталь | admin / owner для своих курсов |
| GET | `/audit/events:search` | Полнотекстовый/structured search (POST due к большому body) | admin |
| GET | `/audit/events/by-actor/{user_id}` | Все действия юзера | admin / self |
| GET | `/audit/events/by-resource/{resource_type}/{resource_id}` | История ресурса | admin / owner of resource |
| GET | `/audit/timeline` | Хронологический срез (filter: scope=tenant/course) | admin |
| GET | `/courses/{id}/audit` | События в рамках курса (proxy для удобства) | owner / co_owner |
| GET | `/users/{id}/audit` | События пользователя | admin / self |
| GET | `/audit/access-denied` | Все 403 — для security review | admin |

**Filter examples:**
```
GET /audit/events?action=submission.created&since=2026-04-01T00:00:00Z&actor_type=user&result=success&cursor=...
```

### B. Search

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/audit/events:search` | Сложный поиск (с `q`, фильтрами, агрегациями) | admin |

```json
{
  "q": "password_changed",
  "filters": { "actor_id": "usr_42", "since": "2026-01-01T00:00:00Z" },
  "aggregations": [{ "type": "count", "by": "action" }]
}
```

### C. Export

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| POST | `/audit/events:export` | Async-экспорт (CSV/JSON) с фильтрами — proxy в Reporting | admin |

### D. Retention policy (admin)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/audit/retention-policy` | Текущая политика тенанта | admin |
| PATCH | `/admin/audit/retention-policy` | Обновить | admin |
| GET | `/admin/audit/retention-status` | Сколько событий подлежат cleanup, дата следующего cleanup | admin |
| POST | `/admin/audit/retention:run-now` | Принудительный cleanup (super_admin) | super_admin |

### E. Legal hold

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/audit/legal-holds` | Список активных | admin |
| POST | `/admin/audit/legal-holds` | Поставить hold (`{resource_id, reason}`) | admin |
| DELETE | `/admin/audit/legal-holds/{id}` | Снять | admin |

(Legal hold блокирует cleanup для конкретного resource_id, например при расследовании.)

### F. Stats

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/admin/audit/stats` | Объём, top-actions, error rate | admin |

### G. Health

`GET /healthz`, `/readyz`, `/metrics`, `/v1/version`.

## События, которые публикует Audit

(Audit сам не публикует доменных событий — это финальная точка пайплайна. Может публиковать `audit.retention_cleaned_total.v1` для observability.)

## События, на которые подписан Audit Service

**Все** из `03-EVENTS.md`, плюс служебные:
- HTTP-вызовы из других сервисов: `POST /audit/events` (internal, по mTLS / service token) — для кейсов, когда событие надо записать гарантированно (RBAC failures, login attempts), не дожидаясь Kafka delivery.

## Метрики (специфичные)

- `audit_events_recorded_total{action, result}`
- `audit_events_storage_bytes` (gauge)
- `audit_search_queries_total{result}`
- `audit_retention_cleaned_total`
- `audit_legal_holds_active{tenant}`

## Реализация: критичные моменты

1. **Append-only**: события только пишутся, никогда не модифицируются. Updates запрещены на уровне БД (revoked role).
2. **Партиционирование**: PG partitioning по месяцам (`audit_events_2026_05`). Cleanup = drop старой partition.
3. **Retention default**: 365 дней для обычных событий, 7 лет для login/access-denied/data-export. Конкретно — `retention_class`.
4. **WORM (Write Once, Read Many)** для compliance: финальный архив (год +) можно реплицировать в S3 Glacier с object-lock'ом.
5. **Search performance**: full-text — через Postgres `tsvector` на `action + actor.id + resource.id + JSON-text`. Если объёмы вырастут — отдельный Elasticsearch cluster (out of scope MVP).
6. **PII в audit**: ip, user_agent — необходимы для security; при анонимизации юзера audit-events этого юзера НЕ удаляются (security requirement), но `actor.id` маркируется anonymized.
7. **Idempotency**: используем `event_id` от Kafka; повтор → no-op.
8. **Внутренний write-API**: между сервисами — mTLS + JWT с claim `service: <name>`. RBAC: только сервисные account'ы с claim `audit:write`.
9. **Read-API защита от утечек**: даже admin не видит чужой тенант, super_admin — может с явным `X-Cross-Tenant`.
