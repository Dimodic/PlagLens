# PlagLens — карта проекта

> **Статус:** актуальная карта реализации на 2026-05-21.
> **Источник истины:** код в этом репозитории (`services/`, `frontend/`, `infra/`, `libs/`). Архитектурный отчёт КТ-1 (10-сервисная топология) лежит в [`legacy/`](./legacy/) как академический артефакт; он **не** обновляется и **не** отражает текущую реальность. При расхождении верить этому документу и коду.

---

## 1. TL;DR

PlagLens — мульти-тенантная платформа для антиплагиата и LLM-ревью кода в университетских курсах по программированию. Стэк:

- **Бэкенд:** **7 FastAPI-сервисов** на Python 3.12 (uv workspace), Postgres 16 (одна БД, схема-на-сервис), Redis 7, Kafka 7.6 (KRaft, без ZK), MinIO (S3-совместимое хранилище).
- **Фронтенд:** SPA на React 19 + TypeScript 5.6 + Vite 5 + Tailwind v4 + shadcn/Radix, ~100 lazy-loaded маршрутов, 141 Playwright-сценарий, русская локализация.
- **Inter-service:** Kafka CloudEvents, schema-per-service Postgres, общий `plaglens-common` для auth/RBAC/observability/идемпотентности.
- **Observability:** Prometheus + Grafana + Jaeger (OTLP), structlog (JSON).
- **Secrets:** HashiCorp Vault (dev-режим), плюс read-only volume для JWT-ключей.
- **Edge:** Traefik v3 (TLS, rate-limit).
- **CI:** GitHub Actions (matrix по сервисам), pre-commit (ruff + mypy + detect-secrets), Playwright E2E.

Рефакторинг 10→7 **завершён**: пять «не затронутых» сервисов (gateway, identity, integration, plagiarism, ai-analysis) живут как раньше; пара `course+submission` склеена в **`course-submission`** (один pyproject пакует три Python-пакета); тройка `audit+notification+reporting` — в сервис **`reporting`** (зонтичный пакет `reporting_app` + три подпакета). Старых папок `services/{course,submission,audit,notification,reporting-audit-notification,…}/` больше нет.

---

## 2. Текущая топология

```
                         ┌───────────────┐
                         │  Frontend SPA │   nginx → /api/* → gateway
                         │  (React 19)   │
                         └──────┬────────┘
                                │
                         ┌──────▼───────┐
                         │   Traefik    │   TLS, rate-limit
                         └──────┬───────┘
                                │
                       ┌────────▼──────────┐
                       │      Gateway      │   JWT, JWKS, routing,
                       │   (stateless)     │   idempotency, /healthz
                       └────────┬──────────┘
                                │
        ┌────────────┬──────────┴─────────┬──────────────┬──────────────┐
        ▼            ▼                    ▼              ▼              ▼
  ┌──────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────┐ ┌──────────────────┐
  │ identity │ │ course-      │ │   integration  │ │ plagiar- │ │   ai-analysis    │
  │          │ │ submission   │ │ (Stepik/YaCon/ │ │ ism      │ │ (LLM, OpenAI-    │
  │ auth,    │ │  (course +   │ │  Telegram/     │ │ (JPlag,  │ │  compat, кеш,    │
  │ 2FA,     │ │  submission) │ │  GSheets/      │ │  MOSS,   │ │  бюджеты,        │
  │ tenants, │ │              │ │  eJudge)       │ │  Dolos,  │ │  prompts)        │
  │ RBAC,    │ │              │ │                │ │  Code-   │ │                  │
  │ OAuth    │ │              │ │                │ │  quiry)  │ │                  │
  └────┬─────┘ └──────┬───────┘ └────────┬───────┘ └────┬─────┘ └────────┬─────────┘
       │              │                  │              │                │
       └──────────────┴──────────┬───────┴──────────────┴────────────────┘
                                 │
                       ┌─────────▼──────────────┐
                       │      reporting         │  reporting + audit + notification
                       │ (reporting_app зонтик) │  (3 схемы, 3 Kafka-consumer-group,
                       │                        │   loopback-HTTP между подмодулями)
                       └─────────┬──────────────┘
                                 │
                ┌────────────────┼────────────────┬──────────────┬─────────────┐
                ▼                ▼                ▼              ▼             ▼
            Postgres 16      Redis 7         Kafka 7.6        MinIO        Vault 1.15
          (8 схем, schema-  (cache, locks,  (KRaft, 1 broker,  (S3,         (KV v2,
           per-service)      rate-limit)     3 partitions)     versioned)   dev mode)

  Observability: Prometheus 2.54 → Grafana 11 ;  OTLP → Jaeger 1.60
  Dev почта:     Mailhog (1025 SMTP, 8025 UI)
  Edge:          Traefik v3.1
```

7 приложений = `gateway`, `identity`, `course-submission`, `integration`, `plagiarism`, `ai-analysis`, `reporting`.

---

## 3. Стек и версии

### 3.1 Python (workspace-корень)

| Слой | Технология | Версия / опции |
|---|---|---|
| Менеджер | uv workspace | members: `libs/*`, `services/*`, `tools` |
| Runtime | Python | 3.12 |
| Web | FastAPI | ≥0.110 (часть сервисов — ≥0.115) |
| ORM | SQLAlchemy[asyncio] | 2.0.29+ |
| Драйвер | asyncpg | (через `postgresql+asyncpg://…`) |
| Миграции | Alembic | per-service (`alembic/versions/`) |
| Kafka | aiokafka | 0.10–0.13 |
| Redis | redis-py | ≥5.0 |
| S3 | minio | per service |
| JWT | pyjwt[crypto] | ≥2.8 (RS256) |
| HTTP | httpx | ≥0.27 |
| Pydantic | pydantic | ≥2.6 |
| LLM | openai | ≥1.30 (используется как OpenAI-совместимый клиент) |
| Шаблоны email | jinja2 | (notification) |
| Email | aiosmtplib | (notification, через Mailhog) |
| Telegram | aiogram | (notification, integration) |
| Google Sheets | google-api-python-client | (integration, reporting) |
| PDF/XLSX | reportlab, openpyxl | (reporting) |
| Scheduler | APScheduler | (integration: in-process; plagiarism: runs) |
| Naming/i18n | python-slugify, deep-translator | (course/submission) |
| Hashes | argon2-cffi | (identity password hashing) |
| 2FA | pyotp | (identity TOTP) |
| Observability | structlog 24, prometheus-client, opentelemetry-* 1.24 / 0.45b0 | (всё через plaglens-common) |
| Vault | hvac | ≥2.1 |

### 3.2 Frontend (`frontend/package.json`)

| Слой | Технология | Версия |
|---|---|---|
| Runtime | React + ReactDOM | 19.2.6 |
| Язык | TypeScript | 5.6.3 (strict) |
| Сборщик | Vite | 5.4.10 |
| Стили | Tailwind CSS | **4.1.17** (через `@tailwindcss/vite`) |
| UI-примитивы | Radix UI | accordion 1.2, dialog 1.1, dropdown 2.1, select 2.2, tabs 1.1, tooltip 1.2 и др. |
| UI-обёртки | shadcn-style в `src/components/ui/` | – |
| Иконки | lucide-react | ^1.14 |
| Темы | next-themes | 0.4 |
| Графики | recharts | 3.8 |
| Таблицы (xlsx UI) | @univerjs/presets, @univerjs/preset-sheets-core | 0.22 |
| Маршрутизация | react-router-dom | 6.30 |
| HTTP-клиент | axios | 1.16 (с JWT refresh interceptor) |
| Data fetching | @tanstack/react-query | 5.100 |
| Реактивные потоки | rxjs | 7.8 |
| Формы | react-hook-form + @hookform/resolvers | 7.75 / 5.2 |
| Валидация | zod | 4.4 |
| Toasts | sonner | 2.0 |
| Drawer | vaul | 1.1 |
| Carousel | embla-carousel-react | 8.6 |
| Резизер | react-resizable-panels | 4.11 |
| Command palette | cmdk | 1.1 |
| OTP-инпут | input-otp | 1.4 |
| Даты | dayjs 1.11 / date-fns 4 / react-day-picker 10 | |
| Шрифты | @fontsource-variable/inter, @fontsource-variable/geist-mono | 5.2 |
| Утилы CSS | class-variance-authority, clsx, tailwind-merge, tw-animate-css | |
| Тесты | @playwright/test 1.59, vitest 2.1, @testing-library/react 16, @axe-core/playwright 4.11 | |
| Линт | eslint 8.57, @typescript-eslint/* 8.13, prettier 3.3 | |

### 3.3 Контейнеры (инфра)

| Образ | Версия | Назначение |
|---|---|---|
| `postgres` | 16-alpine | основная БД (одна БД `plaglens`, 8 схем) |
| `redis` | 7-alpine | кэш, rate-limit, distributed locks (AOF + snapshot 60s/1000ops) |
| `confluentinc/cp-kafka` | 7.6.1 (KRaft, 1 brk, 3 part, RF=1, 7d ret) | event bus |
| `confluentinc/cp-kafka` (init) | 7.6.1 | создаёт топики |
| `provectuslabs/kafka-ui` | latest | dev-мониторинг Kafka |
| `minio/minio` | latest | S3-совместимое объектное хранилище |
| `minio/mc` | latest (init) | создаёт бакеты + lifecycle |
| `prom/prometheus` | v2.54.1 | метрики, 15d retention |
| `grafana/grafana` | 11.2.0 | дашборды (provisioned datasource + 1 overview-доска) |
| `jaegertracing/all-in-one` | 1.60 | OTLP gRPC (4317), HTTP (4318), UI (16686) |
| `hashicorp/vault` | 1.15 (dev) | KV v2 для секретов |
| `traefik` | v3.1 | edge, TLS, rate-limit |
| `mailhog/mailhog` | latest | dev SMTP (1025) + UI (8025) |

---

## 4. Бэкенд-сервисы

Все сервисы строятся как `services/<name>/` со структурой:

```
services/<name>/
├── Dockerfile
├── pyproject.toml
├── alembic.ini, alembic/versions/
├── entrypoint.sh        # ждёт Postgres/Redis, migrate, uvicorn
├── src/<name>_service/  # api/, models.py, services/, events/, …
└── tests/
```

### 4.1 Gateway — [`services/gateway/`](../../services/gateway/)

- **Назначение:** stateless API-вход; маршрутизация к upstream-сервисам, JWT-валидация через JWKS из Identity, агрегированный `/healthz`, идемпотентность, rate-limit.
- **БД:** нет.
- **Зависимости:** FastAPI, httpx, Redis (rate-limit + idempotency cache), pyjwt[crypto], prometheus-client, pyyaml.
- **Особенность:** `GATEWAY_BACKEND_COURSE` и `GATEWAY_BACKEND_SUBMISSION` оба указывают на `course-submission`, а трио `_NOTIFICATION` / `_REPORTING` / `_AUDIT` — на `reporting` (см. [`infra/docker-compose.yml`](../../infra/docker-compose.yml)). Таблица маршрутов на стороне gateway остаётся «10-сервисной», склеивание делается env-переменными.
- **Ключевые роуты:** `/healthz`, `/jwks`, `/api/v1/*` (прокси), `/search`, `/_proxy/*`, `/_debug/client-errors`, `/metrics`.

### 4.2 Identity — [`services/identity/`](../../services/identity/)

- **Назначение:** аутентификация, пользователи, тенанты (мульти-институциональность), сессии, API-ключи, RBAC, OAuth, 2FA (TOTP), JWKS-эндпоинт.
- **Схема Postgres:** `identity` (роль `identity_app`).
- **Стек:** FastAPI, SQLAlchemy[asyncio], argon2-cffi, authlib, pyotp, email-validator, aiokafka.
- **Миграции:** 4 ревизии.
- **Ключевые роуты:** `/api/v1/auth/*`, `/api/v1/users/*`, `/api/v1/tenants/*`, `/api/v1/roles/*`, `/api/v1/oauth/*`, `/api/v1/.well-known/jwks.json`.
- **Kafka:** продюсирует `plaglens.identity.user.v1`, `plaglens.identity.tenant.v1`.
- **Bootstrap:** при первом запуске создаёт супер-админа (`BOOTSTRAP_SUPER_ADMIN_*`).

### 4.3 Course-Submission (объединённый) — [`services/course-submission/`](../../services/course-submission/)

- **Назначение:** один процесс монтирует роутеры **course** (курсы, задания, группы, дедлайны, члены) и **submission** (посылки, файлы, оценки, фидбек, флаги, bulk).
- **Схемы Postgres:** `course` и `submission` под общей ролью `course_submission_app`; обе мигрируются последовательно из общего entrypoint.
- **Структура `src/`:**
  - `course_submission_service/main.py` — сборка FastAPI-приложения, общий движок SQLAlchemy + lifespan;
  - `course_submission_service/course_client.py` — `InProcessCourseClient`: submission читает таблицы course прямо из общего пула соединений вместо HTTP;
  - `course_service/` и `submission_service/` — два Python-пакета с самой бизнес-логикой; оба пакуются в один wheel вместе с зонтиком (см. `[tool.hatch.build.targets.wheel].packages` в pyproject).
- **Alembic:** две независимые папки `course_alembic/` и `submission_alembic/` рядом с сервисом; entrypoint прогоняет обе последовательно.
- **Стек:** FastAPI 0.115+, SQLAlchemy 2.0, aiokafka, MinIO (submission хранит файлы посылок), orjson, deep-translator, python-slugify.
- **Миграции:** course — 3 ревизии, submission — 6 ревизий (самая активная история).
- **Роуты (суммарно):** `/api/v1/courses/*`, `/api/v1/assignments/*`, `/api/v1/groups/*`, `/api/v1/members/*`, `/api/v1/submissions/*`, `/api/v1/grading/*`, `/api/v1/feedback/*`, `/api/v1/flags/*`, `/api/v1/bulk/*`, `/api/v1/self-service/*`.
- **Kafka:** consumer — identity events; producer — `plaglens.course.*`, `plaglens.submission.*`.

### 4.4 Integration — [`services/integration/`](../../services/integration/)

- **Назначение:** адаптеры внешних источников посылок и OAuth-флоу.
- **Схема Postgres:** `integration`.
- **Адаптеры (`src/integration_service/adapters/`):** `stepik.py`, `yandex_contest.py`, `telegram.py`, `google_sheets.py`, `ejudge.py`, `manual.py`.
- **Стек:** FastAPI, SQLAlchemy, aiokafka, aiogram, google-api-python-client, authlib, APScheduler (in-process — отсюда же `autosync`).
- **Миграции:** 2 ревизии.
- **Ключевые роуты:** `/api/v1/integrations/{stepik,yandex,telegram,gsheets,ejudge,manual}/*`, OAuth callback, webhooks.
- **Kafka:** продюсирует события импорта посылок в `plaglens.integration.*`.

### 4.5 Plagiarism — [`services/plagiarism/`](../../services/plagiarism/)

- **Назначение:** оркестрация внешних детекторов плагиата, хранение пар совпадений, suspicious flags, cross-course corpus.
- **Схема Postgres:** `plagiarism`.
- **Провайдеры (`src/plagiarism_service/providers/`):** `jplag.py`, `moss.py`, `codequiry.py`, `dolos.py` (полные реализации).
- **Стек:** FastAPI, SQLAlchemy, aiokafka, MinIO, APScheduler, httpx.
- **Миграции:** 1 ревизия.
- **Лимит параллельности:** не более 3 одновременных runs (из compose env).
- **Ключевые роуты:** `/api/v1/runs/*`, `/api/v1/reports/*`, `/api/v1/suspicious/*`, `/api/v1/corpus/*`, `/api/v1/provider-admin/*`, `/api/v1/webhooks/*`, `/api/v1/assignment-config/*`.
- **Kafka:** продюсирует `plaglens.plagiarism.run.v1`, потребляет события из submission.

### 4.6 AI-Analysis — [`services/ai-analysis/`](../../services/ai-analysis/)

- **Назначение:** LLM-ревью кода с мульти-провайдерной поддержкой (OpenAI / Yandex GPT / GigaChat / self-hosted), versioned prompts, кешем (TTL 14d), бюджетами по тенантам (default $100).
- **Схема Postgres:** `ai_analysis`.
- **Стек:** FastAPI, SQLAlchemy, aiokafka, Redis, httpx, openai≥1.30, prompt management.
- **Миграции:** 2 ревизии.
- **Зависимости (HTTP):** `course-submission` (для исходников посылок), `plagiarism` (для контекста flagged-пар).
- **Ключевые роуты:** `/api/v1/analyses/*`, `/api/v1/batch/*`, `/api/v1/budgets/*`, `/api/v1/admin/cache`, `/api/v1/admin/prompts`, `/api/v1/admin/providers`, `/api/v1/operations/*`, `/api/v1/curate/*`, `/api/v1/reports/*`.
- **Kafka:** consumer — события submission/plagiarism; producer — `plaglens.ai.*`.

### 4.7 Reporting (объединённый) — [`services/reporting/`](../../services/reporting/)

- **Назначение:** один процесс монтирует **три** под-приложения (reporting + audit + notification); **в отличие от course-submission, БД не делится** — каждое держит свою схему и свой Kafka-consumer-group, поэтому объединение чисто «процессное».
- **Схемы Postgres:** `reporting`, `audit`, `notification` под общей ролью `reporting_app`. Миграции запускаются последовательно (`reporting_alembic.ini`, `audit_alembic.ini`, `notification_alembic.ini`).
- **Структура `src/`:**
  - `reporting_app/main.py` — зонтик: запускает три `lifespan_context()` через `AsyncExitStack`, собирает один FastAPI-app со всеми роутерами и одним `health`/`metrics`/`version` surface;
  - `reporting_service/`, `audit_service/`, `notification_service/` — три бизнес-пакета (всё пакуется в один wheel).
- **Внутренние HTTP-хопы:** reporting ↔ audit ходят по `http://reporting:8000` (env `AUDIT_SERVICE_BASE_URL`, `REPORTING_BASE_URL` указывают на self).
- **Reporting:** экспорты CSV / XLSX / JSON / PDF / Google Sheets; read-models дашбордов; `reporting_service/generators/`.
- **Audit:** append-only журнал, retention policy, legal holds; consumer слушает все Kafka-топики, пишет в свою таблицу.
- **Notification:** диспатчеры in-app (SSE) / email (SMTP→Mailhog) / Telegram, шаблоны Jinja2, preferences, DLQ.
- **Стек:** FastAPI, SQLAlchemy, aiokafka, MinIO (reporting артефакты), aiosmtplib, sse-starlette, jinja2, reportlab, openpyxl, google-api-python-client, aiogram, python-ulid.
- **Ключевые роуты:** `/api/v1/exports/*`, `/api/v1/audit/*`, `/api/v1/notifications/*`, `/api/v1/preferences/*`, `/api/v1/sse/*`, `/api/v1/dashboards/*`.

---

## 5. Общая библиотека — `libs/plaglens-common`

Версия 0.1.0, Python ≥3.12, build via hatchling.

| Модуль (`src/plaglens_common/`) | Назначение |
|---|---|
| `errors.py` | Доменные исключения (`PlagLensError`, `NotFoundError`, `ForbiddenError`, `TokenExpiredError`, `TokenRevokedError`, `UnauthenticatedError`, `TenantMismatchError`, `BudgetExceededError`, `RateLimitError`). |
| `problem.py` | RFC 7807 Problem Details: `Problem`, `ProblemException`, `ERROR_CODES`, `make_handlers()`. |
| `auth.py` | JWT RS256-валидация, JWKS-кеш в Redis (TTL 3600s), проверка revocation (`plaglens:jti_revoked:*`). |
| `rbac.py` | Декораторы `require_global_role()`, `require_course_role()`; роли описаны в `architecture_decisions.md` (см. memory). |
| `events.py` | CloudEvents v1.0 + Kafka: `KafkaEventProducer`, `KafkaEventConsumer`, `ProcessedEventStore` (для at-least-once дедупликации). |
| `operation.py` | Канвас-стиль long-running операций: `Operation`, `OperationStatus`. |
| `pagination.py` | Cursor-пагинация (`encode_cursor`, `decode_cursor`, `PaginatedResponse`). |
| `idempotency.py` | ASGI-middleware для `Idempotency-Key`; кеширует ответы POST в Redis, 409 при конфликте ключ↔тело. |
| `health.py` | `health_router()`: `/healthz`, `/readyz`, `/metrics`, `/v1/version`. |
| `observability.py` | `install_observability(app, …)`: Prometheus middleware + OTel FastAPI/SQLA/httpx instrumentation. |
| `logging.py` | structlog JSON, redaction sensitive keys (password, token, api_key). |
| `metrics.py` | `http_requests_total`, `http_request_duration_seconds`. |
| `tracing.py` | OTel OTLP exporter setup. |
| `secrets.py` | `VaultClient`, `resolve_secret()` с fallback на env. |
| `headers.py` | Константы канонических заголовков (`REQUEST_ID`, `IDEMPOTENCY_KEY`, `TENANT_HINT`). |
| `service_client.py` | Типизированный httpx-клиент для service-to-service вызовов. |

Опциональные группы: `[fastapi]` (fastapi+starlette), `[kafka]` (aiokafka), `[dev]` (pytest, respx, fakeredis, ruff, mypy).

---

## 6. Фронтенд (`frontend/`)

### 6.1 Структура `src/`

| Папка | Содержит |
|---|---|
| `api/` | `client.ts` (axios + JWT refresh, idempotency), 18 эндпоинт-модулей (`auth`, `courses`, `assignments`, `submissions`, `plagiarism`, `ai`, `users`, `tenants`, `audit`, `notifications`, `integrations`, `oauth`, `operations`, `reporting`, `search`, `system` и др.), `types.ts`, `pagination.ts`, `operation.ts`, `sse.ts`. |
| `auth/` | `AuthProvider.tsx`, `ProtectedRoute.tsx`, `RoleGuard.tsx`, `useAuth.ts`. |
| `components/ui/` | shadcn-обёртки над Radix (~26 примитивов: button, card, dialog, table, sheet, command, popover, …). |
| `components/{admin,ai,assignments,common}/` | доменные компоненты. |
| `pages/{auth,me,courses,assignments,submissions,admin,ai,plagiarism,dashboard,teacher,notifications,reporting,integrations}/` | страницы (lazy-loaded). |
| `routes/index.tsx` | ~100 маршрутов через `React.lazy()`; cold path грузит только `LoginPage`, `ErrorPage`, `HomeRedirect`. |
| `layout/AppShell.tsx` | navbar + sidebar + Suspense-fallback. |
| `hooks/`, `lib/`, `i18n/`, `styles/`, `utils/` | вспомогательное; `i18n/ru.json` — основной язык UI. |

### 6.2 Деление по ролям (на основе `RoleGuard`)

- **Публичные:** `/login`, `/register`, `/auth/{forgot,reset,verify}`, `/auth/oauth/callback`, `/demo`.
- **Любой авторизованный:** `/me/*`, `/courses`, `/assignments/:id`, `/submissions/:id`, `/notifications`, `/settings`.
- **Преподаватель + админ:** `/grading`, `/integrations/*`, `/assignments/:id/plagiarism`, `/assignments/:id/ai-analyses`.
- **Админ:** `/admin/{users,tenants,integrations,notifications,audit,roles,health,settings,plagiarism-corpus}/*`, `/activity`, AI-провайдеры/бюджеты/кэш.

### 6.3 API-клиент

`src/api/client.ts`:
- axios с in-memory access-токеном;
- на 401 + `TOKEN_EXPIRED` — одна попытка refresh, retry;
- на 401 без refresh — `onUnauthorized()` → logout;
- автогенерация `Idempotency-Key` для POST;
- проксирование ошибок к `Problem`-объектам;
- репортинг 4xx/5xx (кроме 401) на `/_debug/client-errors`.

### 6.4 Тесты (`frontend/e2e/`)

141 файл Playwright, ~13.7K строк. Группы: smoke (4), auth (9), courses (13), assignments (8), submissions (9), plagiarism (8), ai (12), admin (25), notifications (12), audit (7), reporting (13), accessibility (5), mobile (4), performance (3), negative/security (10), cross-cutting (9), dashboards (7), profile (7).

Конфиг (`playwright.config.ts`): Chromium headless/headed + Pixel 5 (`mobile-chrome` opt-in), 1366×768, `ru-RU`, `Europe/Moscow`, 2 worker (anti rate-limit auth), retries 2 (CI) / 1 (local), screenshot+video on failure, trace on retry.

### 6.5 Сборка и деплой

- **Vite:** `optimizeDeps` явно перечисляет Radix + TanStack для прогрева; recharts исключён (lazy на дашбордах); хешированные ассеты + timestamp, чтобы пробивать nginx `immutable`.
- **Dockerfile** (multi-stage): build на `node:20-alpine` → `dist/`; serve на `nginx:alpine` с `frontend/nginx.conf` (SPA fallback на `index.html`, reverse-proxy `/api/*` → `gateway:8000`, gzip, immutable-cache хешам, runtime DNS на gateway, healthcheck `/healthz`).

---

## 7. Инфраструктура (`infra/`)

### 7.1 Compose-файлы

- `docker-compose.yml` — основной стек (см. `name: plaglens`).
- `docker-compose.dev.override.yml` — host-ports, frontend HMR (Vite на 5174), hot-reload через bind-mounts.

### 7.2 Сетевые сервисы и порты

| Сервис | Host-порт по умолчанию | Внутренний |
|---|---|---|
| gateway | 8001 (dev), `443` (prod через traefik) | 8000 |
| identity | 8002 | 8000 |
| course-submission | 8003 | 8000 |
| integration | 8005 | 8000 |
| plagiarism | 8006 | 8000 |
| ai-analysis | 8007 | 8000 |
| reporting | 8008 | 8000 |
| frontend | 5173 | 80 |
| postgres | 5432 | 5432 |
| redis | 6379 | 6379 |
| kafka | 9092 / 9094 external | 9092 |
| kafka-ui | 8080 | 8080 |
| minio | 9000 / 9001 (console) | 9000 |
| prometheus | 9090 | 9090 |
| grafana | 3000 | 3000 |
| jaeger | 16686 (UI), 4317 (OTLP gRPC), 4318 (OTLP HTTP) | – |
| vault | 8200 | 8200 |
| traefik | 80/443, 8081 (dashboard), 8082 (metrics) | – |
| mailhog | 1025 (SMTP), 8025 (UI) | – |

### 7.3 Postgres — схема-на-сервис

Одна БД `plaglens`, 8 схем под отдельными ролями:

| Схема | Роль | Используется |
|---|---|---|
| `identity` | `identity_app` | identity |
| `course` | `course_submission_app` | course-submission |
| `submission` | `course_submission_app` | course-submission |
| `integration` | `integration_app` | integration |
| `plagiarism` | `plagiarism_app` | plagiarism |
| `ai_analysis` | `ai_analysis_app` | ai-analysis |
| `reporting` | `reporting_app` | reporting |
| `audit` | `reporting_app` | reporting |
| `notification` | `reporting_app` | reporting |
| `gateway` | `gateway_app` | (на будущее; gateway сейчас stateless) |

Init-скрипт `infra/init/postgres/01-create-schemas.sh` создаёт схемы, роли и расширения (`uuid-ossp`, `pgcrypto`, `pg_trgm`). Мульти-тенантность — на уровне приложения (FK `tenant_id` в таблицах), **не на уровне БД-схем**.

### 7.4 Kafka

KRaft (без ZK), 1 брокер, 3 партиции/топик, RF=1, retention 168h (7d).
Имена топиков шаблоном: `plaglens.<domain>.<entity>.v1` + `.dlq.v1`. Создаются скриптом `infra/init/kafka/create-topics.sh`.

### 7.5 Observability

- **Prometheus** — `infra/prometheus/prometheus.yml`, scrape `/metrics` каждого сервиса (15s), 15d retention, отдельный job на traefik metrics (`:8082`).
- **Grafana** — provisioned datasource (Prometheus), интеграция с Jaeger через traceQL editor; 1 dashboard `overview.json` в `infra/grafana/dashboards/`.
- **Jaeger all-in-one** — принимает OTLP gRPC/HTTP, экспонирует UI.
- Все сервисы шлют OTLP на `http://jaeger:4317` (env `OTEL_EXPORTER_OTLP_ENDPOINT`).

### 7.6 Vault и секреты

- Vault в **dev-режиме** с авто-unseal; KV v2.
- `infra/init/vault/seed-secrets.sh` сидит плейсхолдеры: `secret/plaglens/{jwt,oauth/*,llm/*,plagiarism/*,integration/webhook}`.
- JWT keypair — `make gen-keys` → `infra/secrets/jwt_{public,private}.pem`, монтируется read-only во все backend-контейнеры.
- `infra/secrets/` (gitignored) — реальные dev-секреты.

### 7.7 Edge

Traefik v3.1: Docker + file provider, ACME (LE staging для dev), TLS-терминация, middleware `rate-limit` (avg 100, burst 200). Конфиг в `infra/traefik/traefik.yml` + `infra/traefik/dynamic/`.

---

## 8. DevOps и тулинг

### 8.1 Makefile (ключевые цели)

| Группа | Цели |
|---|---|
| bootstrap | `bootstrap`, `gen-keys` |
| compose | `build`, `up`, `up-dev`, `down`, `reset`, `ps`, `logs SERVICE=`, `restart SERVICE=` |
| тесты | `test-all`, `test SERVICE=`, `e2e` (Python через `tools/e2e/`), `ui-e2e-*` |
| качество | `lint-all`, `format-all`, `typecheck-all` |
| миграции | `migrate-all`, `migrate SERVICE=`, `makemigration SERVICE= MSG=` |
| данные | `seed-demo`, `seed-demo-reset` |
| фронт | `ui-dev`, `ui-build` |

### 8.2 Pre-commit (`.pre-commit-config.yaml`)

- `pre-commit-hooks` v5.0 — `end-of-file-fixer`, `trailing-whitespace`, `check-yaml`, `check-json`, `check-large-files` (max 1MB), `mixed-line-ending`;
- `astral-sh/ruff` v0.9.10 — `ruff` + `ruff-format`;
- `mirrors-mypy` v1.13 — на `src/` (strict off);
- `Yelp/detect-secrets` v1.5 — baseline `.secrets.baseline`.

### 8.3 GitHub Actions (`.github/workflows/`)

- **`ci.yml`** — push/PR в main: матрица `service-checks` по 10 целям (старые имена + libs) — ruff/mypy/pytest с coverage; `docker-compose-validate`; best-effort `e2e`.
- **`e2e.yml`** — Playwright стенд: Node 20 + Python 3.12, генерация JWT-ключей, `docker compose up`, seed-demo, `playwright test`, HTML+JUnit отчёты.
- **`release.yml`** — на тег `v*`: matrix docker build (QEMU + Buildx), пуш в GHCR `ghcr.io/<owner>/plaglens/<service>:{semver, sha}`, draft релиза.

### 8.4 Tooling (`tools/`)

- `tools/e2e/` — pytest+pytest-asyncio E2E против живого стека (gateway), env-driven (`PLAGLENS_GATEWAY_URL`, `PLAGLENS_TEST_*`); маркеры `smoke`, `auth`. Файлы: `test_smoke.py`, `test_seed_demo.py`.
- `tools/scripts/` — операторские скрипты:
  - `create-tenant.py`, `create-test-data.py`, `seed-demo-data.py`, `seed-providers.py`, `seed_real_kn_cpp.py`, `seed_real_kn_cpp_course.py`, `seed_one_student.py`;
  - `bootstrap-super-admin.py`, `gen-jwt-keys.sh`;
  - `health-check.py`, `autosync.py` (резерв — основной планировщик теперь in-process в integration).

---

## 9. Состояние рефакторинга 10 → 7

| Старые | Объединённый сервис | Состояние | Где живёт код | Запускается отдельно? |
|---|---|---|---|---|
| `course` + `submission` | `course-submission` | ✅ выполнено, старые папки удалены | `services/course-submission/src/{course_submission_service,course_service,submission_service}/` | да (один контейнер) |
| `audit` + `notification` + `reporting` | `reporting` | ✅ выполнено, старые папки удалены | `services/reporting/src/{reporting_app,reporting_service,audit_service,notification_service}/` | да (один контейнер) |
| `identity` | – | без изменений | `services/identity/` | да |
| `gateway` | – | без изменений | `services/gateway/` | да |
| `integration` | – | без изменений | `services/integration/` | да |
| `plagiarism` | – | без изменений | `services/plagiarism/` | да |
| `ai-analysis` | – | без изменений | `services/ai-analysis/` | да |

Изменения, зафиксированные при слиянии:

- **Один pyproject на сервис.** В обоих зонтиках `[tool.hatch.build.targets.wheel].packages` перечисляет 3–4 Python-пакета, которые ставятся одним wheel.
- **Один Dockerfile-этап сборки.** Старые multi-stage сборки, копировавшие отдельные `services/{course,submission}` / `services/{reporting,audit,notification}` в /opt и делавшие три `pip wheel`, заменены на один `COPY services/<umbrella>/{pyproject.toml,src} && pip wheel .`.
- **CI / Release матрицы** в `.github/workflows/{ci,release}.yml` приведены к 7 целям + `plaglens-common`.
- **Postgres-роль** для объединённого reporting называется `reporting_app` (была `reporting_audit_notification_app`). Init-скрипт `infra/init/postgres/01-create-schemas.sh` обновлён. Для существующих dev-БД нужен `make reset && make up` — заново создаст схемы под новой ролью.

---

## 10. Потоки данных и события

### 10.1 Канонический happy-path для посылки

```
Student              Frontend          Gateway        Integration       course-submission     plagiarism        ai-analysis     RAN*
  │   upload code     │                 │                │                 │                   │                 │              │
  ├──────────────────►│                 │                │                 │                   │                 │              │
  │                   │ POST /submissions, Idempotency-Key                 │                   │                 │              │
  │                   ├────────────────►│ JWT verify    │                 │                   │                 │              │
  │                   │                 ├──────► put file in MinIO + row in submission schema │                 │              │
  │                   │                 │                │                 │ emit plaglens.submission.created.v1 │              │
  │                   │                 │                │                 ├──────────────────►│ consume          │              │
  │                   │                 │                │                 │                   │ run JPlag/MOSS   │              │
  │                   │                 │                │                 │                   │ emit plaglens.plagiarism.run.v1 │
  │                   │                 │                │                 │                   ├────────────────►│ consume +    │
  │                   │                 │                │                 │                   │                 │ LLM analyze  │
  │                   │                 │                │                 │                   │                 │ emit plaglens.ai.report.v1 ►│ consume
  │                   │                 │                │                 │                   │                 │              │ → notifications + audit + reporting
```

`RAN* = reporting` (объединённый: reporting + audit + notification). Audit подписан на **все** доменные топики и пишет append-only журнал; notification — на адресные топики уведомлений; reporting обновляет read-models.

### 10.2 Идемпотентность и rate-limit

- Gateway хранит ключи идемпотентности в Redis (TTL по контракту); повтор с тем же телом возвращает кешированный ответ, конфликт — 409.
- Rate-limit ключи: per-IP, per-user, write-rate, auth-rate, plagiarism-run/h. В dev все пределы выставлены `10000` для прохождения параллельных E2E.

### 10.3 Auth

- Identity подписывает JWT RS256, публикует `JWKS` на `/api/v1/.well-known/jwks.json`.
- Gateway тянет JWKS, кеширует в Redis на 3600s, проверяет токен сам; на 401 даёт `TOKEN_EXPIRED` (frontend сделает refresh).
- Revocation: identity при revoke кладёт `jti` в `Redis` под ключом `plaglens:jti_revoked:<jti>` (используется `plaglens_common.auth`).

---

## 11. Что осталось

1. **Полная сборка и smoke на чистом стенде.** Изменения проверены статически (compose-конфиг валиден, pyproject парсится, все пути на месте). Прогон `make build && make reset && make up && make seed-demo && make e2e` нужно сделать вживую — особенно в первый раз после переименования Postgres-роли `reporting_app`.
2. **`uv.lock` нужно пересоздать** (`uv lock`) — старые workspace-зависимости `plaglens-course-service`, `plaglens-submission-service`, `plaglens-audit-service`, `plaglens-notification-service` исчезли вместе со своими `pyproject.toml`. До тех пор lock хранит мёртвые записи (на работу контейнеров это не влияет — Dockerfile-ы используют свой `pip wheel`).
3. **Глубже объединить `reporting`** (опционально): один engine, один Kafka-consumer вместо trio с loopback-HTTP между reporting↔audit. Это уже задача про дизайн модели, а не про рефакторинг репо.
4. **Комментарии в коде** ещё ссылаются на пути `docs/architecture/0X-NAME.md` — теперь эти файлы лежат в `legacy/`. Это не блокер: ссылки остаются валидными как «спецификация-снимок-во-времени», но если хочется чистоты — массовая правка `legacy/` в путях сделает их кликабельными снова.

---

*Файл создан 2026-05-21 на основе сквозного аудита кода (5 параллельных Explore-агентов + ручные сверки `docker-compose.yml`, `pyproject.toml`, `package.json`). Считать актуальным до следующего рефакторинга; пересмотреть при любом изменении состава сервисов в `infra/docker-compose.yml`.*
