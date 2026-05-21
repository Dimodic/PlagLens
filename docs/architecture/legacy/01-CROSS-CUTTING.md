# Cross-cutting API conventions

> Соглашения, которые применяются **ко всем** эндпоинтам всех сервисов PlagLens. Если в спецификации сервиса не указано иное — действует это.

## 1. Версионирование

- Версия в пути: `/api/v1/...`
- Breaking changes → новая версия `/api/v2/...`. Старая поддерживается ≥6 месяцев.
- Additive changes (новое поле в response, новый optional query param) — не считаются breaking, в той же версии.

## 2. Базовые HTTP-соглашения

| Аспект | Соглашение |
|---|---|
| Методы | `GET` (read), `POST` (create / async action), `PATCH` (partial update), `PUT` (full replace, редко), `DELETE` (soft delete) |
| Безопасные actions | Глаголы через `:` суффикс: `POST /v1/courses/{id}:archive`, `POST /v1/users/{id}:anonymize` |
| Bulk | `POST /v1/{resource}:batchCreate` (AIP-136), всегда async |
| Content-Type запроса | `application/json` (если не file upload) |
| Content-Type ответа | `application/json`, `application/problem+json` для ошибок |
| File upload | `multipart/form-data` |
| Charset | UTF-8 |

## 3. Стандартные заголовки

### Request
| Header | Назначение |
|---|---|
| `Authorization: Bearer <jwt>` | Аутентификация (кроме публичных) |
| `Idempotency-Key: <uuid>` | Идемпотентность для POST (см. §6) |
| `X-Tenant-Hint: <slug>` | Опциональная подсказка для tenant routing на gateway |
| `X-Request-Id: <uuid>` | Если клиент хочет навязать correlation ID; иначе gateway сгенерирует |
| `Accept-Language: ru, en;q=0.9` | Локализация ответных сообщений (validation, problem.title) |
| `If-None-Match: "<etag>"` | Conditional GET для кэширования |

### Response
| Header | Назначение |
|---|---|
| `X-Request-Id: <uuid>` | Correlation ID — кладётся ВСЕГДА, даже на ошибки |
| `X-RateLimit-Limit: <n>` | Лимит окна |
| `X-RateLimit-Remaining: <n>` | Сколько осталось в окне |
| `X-RateLimit-Reset: <epoch>` | Когда окно сбросится |
| `Location: <url>` | На 201 Created и 202 Accepted (URL операции) |
| `ETag: "<hash>"` | Для GET, поддерживающих conditional |
| `Retry-After: <seconds>` | На 429 / 503 |

## 4. Пагинация (cursor-based)

Все list-эндпоинты:

**Request:**
```
GET /v1/courses?cursor=<opaque>&limit=50&sort=-created_at
```
- `limit` — 1..200, default 50
- `cursor` — opaque string (base64 от `(sort_value, id)`)
- `sort` — поля разделены запятой, `-` в начале означает desc

**Response envelope:**
```json
{
  "data": [ { "id": "...", "..." : "..." } ],
  "pagination": {
    "next_cursor": "eyJpZCI6MTIzfQ==",
    "has_more": true,
    "limit": 50
  }
}
```

Когда `has_more: false` — `next_cursor: null`. Клиент **не** должен парсить cursor.

## 5. Модель ошибок (RFC 7807)

Все ошибки возвращаются как `application/problem+json`:

```json
{
  "type": "https://docs.plaglens.ru/errors/validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "Field 'email' must be a valid email address",
  "instance": "/v1/users",
  "code": "VALIDATION_FAILED",
  "errors": [
    { "field": "email", "code": "invalid_format", "message": "..." }
  ],
  "request_id": "01HF8K9..."
}
```

### Стандартные `code` (короткие машинно-читаемые)

| HTTP | code | Когда |
|---|---|---|
| 400 | `BAD_REQUEST` | Невалидный запрос (синтаксис JSON и т.п.) |
| 401 | `UNAUTHENTICATED` | Нет / просрочен JWT |
| 401 | `TOKEN_EXPIRED` | JWT просрочен (клиент должен refresh) |
| 401 | `TOKEN_REVOKED` | JWT отозван |
| 403 | `FORBIDDEN` | Нет прав на действие |
| 403 | `TENANT_MISMATCH` | Запрос к ресурсу другого тенанта |
| 404 | `NOT_FOUND` | Ресурс не существует или не виден текущему юзеру |
| 409 | `CONFLICT` | Конфликт состояния (повторное создание, оптимистическая блокировка) |
| 409 | `IDEMPOTENCY_KEY_CONFLICT` | Тот же ключ с другим телом запроса |
| 410 | `GONE` | Ресурс удалён (soft delete + retention истёк) |
| 413 | `PAYLOAD_TOO_LARGE` | Файл / тело больше лимита |
| 422 | `VALIDATION_FAILED` | Семантическая валидация |
| 423 | `LOCKED` | Ресурс заблокирован (проверка идёт) |
| 429 | `RATE_LIMITED` | Превышен rate limit |
| 451 | `LEGAL_BLOCKED` | DMCA / privacy block |
| 500 | `INTERNAL` | Непредвиденная ошибка |
| 502 | `UPSTREAM_FAILED` | Внешний провайдер вернул ошибку |
| 503 | `SERVICE_UNAVAILABLE` | Сервис в degraded mode |
| 504 | `UPSTREAM_TIMEOUT` | Тайм-аут внешнего провайдера |

## 6. Идемпотентность

### Idempotency-Key (для клиентских POST'ов)
- Любой POST, создающий ресурс или запускающий операцию, **поддерживает** `Idempotency-Key` header (UUID v4).
- Сервер хранит `(idempotency_key, hash_of_request_body) → response` в Redis на 24 часа.
- Повтор с тем же ключом и тем же body → возвращается тот же ответ.
- Повтор с тем же ключом и **другим** body → 409 `IDEMPOTENCY_KEY_CONFLICT`.

### Идемпотентные consumer'ы (для Kafka events)
- Каждый event имеет `event_id` (см. `03-EVENTS.md`).
- Consumer хранит обработанные `event_id` в `processed_events` table (с retention 7 дней).
- Повторное получение того же `event_id` → no-op.

### Идемпотентность импорта посылок
- Дедуп по составному ключу: `(integration_id, external_submission_id)` + дополнительно по `sha256(content)`.

## 7. Async operations (Operation resource, Canvas-style)

Любая долгая операция (импорт, plagiarism check, LLM analysis, export):

### Запуск
```
POST /v1/assignments/{id}:import
Idempotency-Key: <uuid>

→ 202 Accepted
Location: /v1/operations/op_8b7c1f2d
{
  "operation_id": "op_8b7c1f2d",
  "status_url": "/v1/operations/op_8b7c1f2d"
}
```

### Опрос статуса
```
GET /v1/operations/op_8b7c1f2d

→ 200 OK
{
  "id": "op_8b7c1f2d",
  "kind": "submission_import",
  "status": "running",
  "progress": { "completed": 42, "total": 100, "percent": 42.0 },
  "started_at": "2026-05-01T10:23:45Z",
  "updated_at": "2026-05-01T10:24:12Z",
  "finished_at": null,
  "result_url": null,
  "error": null,
  "metadata": { "assignment_id": 123, "source": "stepik" }
}
```

### Возможные `status`
- `queued` — в очереди
- `running` — выполняется
- `completed` — успех; `result_url` ведёт к ресурсу-результату
- `failed` — ошибка; `error` — `Problem` объект
- `cancelled` — отменён через `:cancel`

### Отмена
```
POST /v1/operations/op_8b7c1f2d:cancel
→ 202 Accepted
```

(Не все operations кэнселится — зависит от `kind`.)

### События
На каждое изменение статуса публикуется `operation.status_changed` в Kafka и SSE.

### Лимиты хранения
- Operations хранятся 30 дней после `finished_at`, затем архивируются в audit.

## 8. Аутентификация

### Tokens
- **Access token**: JWT (RS256), payload содержит `sub` (user_id), `tenant_id`, `roles`, `course_roles` (компактный список), `exp` (15 мин), `iat`, `jti`.
- **Refresh token**: opaque (не JWT), хранится в Redis с TTL 30 дней. Передаётся клиенту в **httpOnly + Secure + SameSite=Strict** cookie на домене API.

### Refresh flow
```
POST /v1/auth/refresh
Cookie: __Host-refresh=<opaque>

→ 200 OK
Set-Cookie: __Host-refresh=<new>; Path=/; HttpOnly; Secure; SameSite=Strict
{ "access_token": "<new jwt>", "expires_in": 900 }
```

### Public endpoints (без auth)
- `GET /healthz`, `GET /readyz`, `GET /metrics`
- `POST /v1/auth/login`, `POST /v1/auth/register`, `POST /v1/auth/password/forgot`
- OAuth callbacks `/v1/auth/oauth/{provider}/callback`
- Webhooks `/v1/webhooks/...` (защищены HMAC)
- `GET /v1/version`

## 9. Rate limiting

- Реализуется в API Gateway через Redis (token bucket).
- **Уровни**: `per_ip`, `per_user`, `per_endpoint_class`.
- **Дефолты**:
    - per_ip без auth: 60 req/min
    - per_user authenticated: 600 req/min
    - per_user write (POST/PATCH/DELETE): 120 req/min
    - per_user impostor-class (login, register, password reset): 5 req/min
    - per_user run-class (запуски plagiarism, AI, export): 30 req/hour

При превышении — 429 + `Retry-After`.

## 10. CORS

- Allowlist origin'ов хранится в `Tenant.cors_origins`.
- Преflight `OPTIONS` обрабатывается gateway, не доходит до сервиса.
- Headers разрешены: `Authorization, Content-Type, Idempotency-Key, X-Request-Id, X-Tenant-Hint`.
- Credentials: `true` (для refresh-cookie).

## 11. Health & metrics (стандарт для каждого сервиса)

| Endpoint | Назначение |
|---|---|
| `GET /healthz` | Liveness — 200 если процесс жив |
| `GET /readyz` | Readiness — 200 если все зависимости (БД, Redis, Kafka) доступны |
| `GET /metrics` | Prometheus exposition (text format) |
| `GET /v1/version` | `{ "version": "1.4.2", "commit": "abc123", "built_at": "..." }` |

Метрики, которые экспортит **каждый** сервис (helper-libra `plaglens-obs`):
- `http_requests_total{method, route, status}`
- `http_request_duration_seconds{...}` (histogram)
- `db_query_duration_seconds{operation}`
- `kafka_consumer_lag{topic}`
- `external_call_duration_seconds{provider, operation}`
- `external_call_errors_total{provider, error_type}`

Дополнительные метрики специфичны сервису — описаны в его файле.

## 12. Tracing

- OpenTelemetry SDK во всех сервисах.
- `X-Request-Id` от gateway = `trace_id` в spans.
- Спаны на: HTTP IN/OUT, DB, Redis, Kafka publish/consume, external API.

## 13. Логирование

- Структурированное (JSON), `structlog`.
- Обязательные поля: `timestamp`, `service`, `level`, `message`, `request_id`, `trace_id`, `tenant_id`, `user_id` (если есть).
- Sensitive поля (passwords, tokens, full code) — никогда не логгируются.
- Логи отправляются в Loki (через promtail / vector).

## 14. Локализация

- `Accept-Language` header → выбор сообщения для `Problem.title`, `Problem.detail`, validation messages.
- Поддержка: `ru`, `en`. По умолчанию `ru`.
- ISO timestamps всегда в UTC (`Z` суффикс).

## 15. Безопасность контента

- TLS 1.3+ обязательно (gateway редиректит HTTP → HTTPS).
- HSTS включён, `max-age=31536000; includeSubDomains; preload`.
- CSP на frontend домене.
- Code-input от студентов **никогда не парсится / не выполняется**. Только статический анализ + передача внешним сервисам.

## 16. Soft delete

- DELETE → `deleted_at = now()` + `deleted_by = user_id`.
- Все list/get эндпоинты по умолчанию фильтруют `WHERE deleted_at IS NULL`.
- `?include_deleted=true` query param (доступно admin/owner) — показывает удалённое.
- Hard delete — через специальный admin endpoint после `retention_period` (по умолчанию 90 дней) или GDPR-anonymize.
