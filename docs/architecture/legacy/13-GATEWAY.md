# API Gateway

> Единственный публичный entry point. Все клиентские запросы идут через него. Внутри — FastAPI + middleware (или Traefik с плагинами в продакшне). Не содержит бизнес-логики; только маршрутизация, аутентификация, rate-limit, CORS, логирование, защита от классических атак.

**База URL префикс:** `/api/v1`

## Ответственность

1. **TLS termination** (если не делает edge proxy/Ingress).
2. **Authentication** — валидация JWT (проверка подписи через JWKS, expiry, revoke list в Redis).
3. **Authorization (coarse-grained)** — фильтр по global_role; fine-grained проверки делаются в сервисах.
4. **Routing** — `/api/v1/auth/*` → identity, `/api/v1/courses/*` → course, etc.
5. **Rate-limiting** — token bucket в Redis по `(user_id, endpoint_class)` + `ip`.
6. **CORS** — preflight + добавление headers.
7. **Request logging + correlation ID** — генерация `X-Request-Id` если нет.
8. **Response transformation** — нормализация error формата (если бэк-сервис вернул не-RFC7807, gateway оборачивает).
9. **Bot/abuse protection** — простой honeypot, bot detection (опционально).
10. **API versioning** — на текущей фазе только `/v1/*`.
11. **Universal Operation endpoint** — read-only прокси к `Operation` ресурсу любого сервиса (определяет owner-сервис из префикса operation_id).

## Эндпоинты, которые ОБСЛУЖИВАЕТ сам Gateway

(Не проксируются дальше.)

| Method | Path | Описание | Авторизация |
|---|---|---|---|
| GET | `/v1/health` | Aggregated health: проверяет все backends | public |
| GET | `/v1/version` | Информация о gateway | public |
| GET | `/v1/services-status` | Health всех backend сервисов | super_admin |
| GET | `/v1/.well-known/jwks.json` | Public keys для JWT validation (проксирует Identity) | public |
| GET | `/v1/operations/{op_id}` | Universal Operation status (роутинг по префиксу `op_id`) | bearer |
| POST | `/v1/operations/{op_id}:cancel` | Отмена | bearer |
| GET | `/v1/operations` | Список моих операций | bearer |
| GET | `/healthz` | Liveness gateway | public |
| GET | `/readyz` | Readiness | public |
| GET | `/metrics` | Prometheus | scraper-only |

`Operation` префиксы для роутинга:
- `op_imp_*` → Integration Service
- `op_plg_*` → Plagiarism Service
- `op_ai_*` → AI Analysis Service
- `op_exp_*` → Reporting Service
- `op_grd_*` → Submission Service (batch grade)

## Routing table

| Path prefix | Target service |
|---|---|
| `/api/v1/auth/*` | identity |
| `/api/v1/users/*` | identity |
| `/api/v1/tenants/*` | identity |
| `/api/v1/roles/*` | identity |
| `/api/v1/invitations/*` | identity |
| `/api/v1/.well-known/*` | identity |
| `/api/v1/courses/*` | course (но `/courses/{id}/submissions` внутри маршрутизируется в submission через path-rewrite или внутренние сетевые правила) |
| `/api/v1/assignments/*` | course (и submission) |
| `/api/v1/submissions/*` | submission |
| `/api/v1/integrations/*` | integration |
| `/api/v1/webhooks/*` | integration |
| `/api/v1/plagiarism-runs/*` | plagiarism |
| `/api/v1/plagiarism-corpus/*` | plagiarism |
| `/api/v1/ai-analyses/*` | ai-analysis |
| `/api/v1/notifications/*` | notification |
| `/api/v1/exports/*` | reporting |
| `/api/v1/scheduled-exports/*` | reporting |
| `/api/v1/audit/*` | audit |
| `/api/v1/admin/*` | per sub-path: identity (users, tenants), notification (templates), reporting, plagiarism, ai-analysis, integration, audit |
| `/api/v1/operations/*` | gateway (с диспетчером по префиксу) |

Множественные маршрутизации (например `/courses/{id}/submissions` — это Submission Service, но `/courses/{id}` — Course Service) разруливаются по более специфичному префиксу.

## Middleware pipeline

```
1. Request ID middleware     # X-Request-Id (генерация если нет)
2. Tracing middleware         # OpenTelemetry span
3. Logging middleware         # struct log start
4. CORS middleware            # preflight + headers
5. Body size limit            # 50MB upload, 10MB json
6. Rate limit (per IP)        # для unauthenticated
7. JWT validation             # public endpoints — skip
8. RBAC global pre-check      # super_admin / admin / teacher / student
9. Rate limit (per user)      # после auth
10. Idempotency-Key handler   # cache check для POSTs
11. Forward to backend        # httpx async client
12. Response normalization    # RFC 7807 wrapping if needed
13. Logging middleware        # log end + duration
```

## Конфигурация

`gateway.yaml`:
```yaml
backends:
  identity:    http://identity-service:8000
  course:      http://course-service:8000
  submission:  http://submission-service:8000
  integration: http://integration-service:8000
  plagiarism:  http://plagiarism-service:8000
  ai-analysis: http://ai-analysis-service:8000
  notification: http://notification-service:8000
  reporting:   http://reporting-service:8000
  audit:       http://audit-service:8000

routes:
  - prefix: /api/v1/auth
    backend: identity
    public: [POST /api/v1/auth/login, POST /api/v1/auth/register, POST /api/v1/auth/refresh, POST /api/v1/auth/password/forgot, GET /api/v1/auth/oauth/*/callback]
  - prefix: /api/v1/courses
    backend: course
  - prefix: /api/v1/courses/{id}/submissions
    backend: submission
  - ...

rate_limits:
  default_per_ip:    { rpm: 60 }
  default_per_user:  { rpm: 600 }
  endpoint_classes:
    auth_sensitive:  { rpm: 5 }      # login, register, password reset
    write:           { rpm: 120 }
    run:             { rph: 30 }     # запуски plagiarism, AI, export

cors:
  allowed_origins_per_tenant: true   # читаются из tenant.cors_origins

body_limits:
  default: 1MB
  multipart: 50MB
```

## Health & Metrics (gateway-specific)

### Метрики
- `gateway_requests_total{route, status}`
- `gateway_request_duration_seconds{route}` (histogram)
- `gateway_rate_limit_hits_total{tier}`
- `gateway_jwt_validations_total{result}` — `success`, `expired`, `revoked`, `invalid_signature`
- `gateway_backend_errors_total{backend, error_type}`
- `gateway_backend_unavailable_total{backend}`
- `gateway_active_connections{}` (gauge)
- `gateway_idempotency_cache_hits_total`

## Реализация: критичные моменты

1. **JWT validation**: gateway кэширует JWKS на 1 час (с graceful refresh). На каждый запрос — проверка подписи + `exp` + `revoke list` (Redis SET membership).
2. **Tenant isolation enforcement**: gateway добавляет `X-Tenant-Id` header в проксированный запрос (взяв из JWT). Backend сервисы доверяют этому header — но всё равно дополнительно проверяют consistency с `tenant_id` ресурса.
3. **Rate limit storage**: Redis `INCR` + `EXPIRE` либо token-bucket через Lua-script.
4. **Circuit breaker per backend**: если backend возвращает 5xx > N% за 30s — открываем circuit на 60s, в это время → 503 c `Retry-After`.
5. **Hop-by-hop headers** не пропускаются (Connection, Transfer-Encoding и т.д.).
6. **TLS внутри**: между gateway и сервисами — внутренняя сеть Docker/k8s, для k8s в перспективе — mTLS через service mesh.
7. **WAF минимум**: blacklist по IP (через Redis SET), простые regex-фильтры на body для SQLi/XSS попыток.
8. **Operations dispatcher**: при `GET /v1/operations/op_plg_...` gateway понимает префикс, прокся в нужный backend `GET /v1/operations/op_plg_...` (URL не переписывает — каждый сервис знает свои operation IDs).
9. **Health agg**: `/v1/health` сначала отвечает 200, если все backends healthy. Если один — degraded → 200 с `status: degraded`. Если несколько — 503.
10. **Версионирование**: при появлении v2 — gateway маршрутизирует `/api/v2/*` на новые версии сервисов; v1 продолжает работать в legacy mode ≥6 месяцев.
