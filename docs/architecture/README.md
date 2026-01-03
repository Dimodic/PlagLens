# PlagLens — Architecture documentation

Полная архитектура целевого решения PlagLens, спроектированная на основе КТ-1 (PDF в корне репозитория).

## Структура

| Файл | Что внутри |
|---|---|
| [`00-OVERVIEW.md`](./00-OVERVIEW.md) | Видение, сервисная топология (10 микросервисов), стек, deployment, принципы |
| [`01-CROSS-CUTTING.md`](./01-CROSS-CUTTING.md) | API conventions: пагинация, ошибки RFC 7807, async-операции, идемпотентность, аутентификация, rate-limit |
| [`02-RBAC.md`](./02-RBAC.md) | Роли, permissions matrix, изоляция тенантов, JWT payload |
| [`03-EVENTS.md`](./03-EVENTS.md) | Kafka topics, контракт событий, регистр событий, schema evolution, DLQ |
| [`04-IDENTITY.md`](./04-IDENTITY.md) | **Identity Service** — auth, OAuth, users, tenants, sessions, API keys |
| [`05-COURSE.md`](./05-COURSE.md) | **Course Service** — курсы, группы, задания, дедлайны, члены |
| [`06-SUBMISSION.md`](./06-SUBMISSION.md) | **Submission Service** — посылки (все версии), файлы, оценки, фидбек |
| [`07-INTEGRATION.md`](./07-INTEGRATION.md) | **Integration Service** — Stepik, Я.Контест, Telegram, Google Sheets, webhooks |
| [`08-PLAGIARISM.md`](./08-PLAGIARISM.md) | **Plagiarism Service** — JPlag/MOSS/Codequiry/Dolos, runs, pairs, cross-course corpus |
| [`09-AI-ANALYSIS.md`](./09-AI-ANALYSIS.md) | **AI Analysis Service** — OpenAI-compat LLM, кэш, бюджеты, prompt versioning |
| [`10-NOTIFICATION.md`](./10-NOTIFICATION.md) | **Notification Service** — in-app SSE / email / Telegram, persistent, preferences |
| [`11-REPORTING.md`](./11-REPORTING.md) | **Reporting Service** — exports (CSV/XLSX/JSON/PDF/Sheets) + дашборды |
| [`12-AUDIT.md`](./12-AUDIT.md) | **Audit Service** — append-only журнал, retention, legal hold |
| [`13-GATEWAY.md`](./13-GATEWAY.md) | **API Gateway** — routing, JWT, rate-limit, CORS, universal Operation endpoint |

## Как читать

1. **Начните с** `00-OVERVIEW.md` для общего понимания.
2. Перед тем, как погрузиться в любой сервис — пробегите `01-CROSS-CUTTING.md`. Все эндпоинты следуют этим соглашениям, поэтому в файлах сервисов специфика не дублируется.
3. `02-RBAC.md` и `03-EVENTS.md` — два cross-cutting концепта, на которые ссылаются все сервисы.
4. Сервисы (04–13) — независимы; читайте по порядку приоритета.

## Сводная таблица эндпоинтов

| Сервис | Кол-во эндпоинтов (порядок) | Critical features |
|---|---|---|
| Identity | ~55 | OAuth с 4 провайдерами, 2FA, multi-tenancy, anonymize |
| Course | ~40 | Multi-owner, groups, deadline extensions, duplicate |
| Submission | ~35 | Все версии, batch grading, manual upload, late detection |
| Integration | ~35 | Pluggable adapters, OAuth flow, schedules, webhooks |
| Plagiarism | ~30 | 4 провайдера, cross-course corpus, suspicious flagging |
| AI Analysis | ~30 | OpenAI-compat, multi-provider failover, бюджеты, prompts |
| Notification | ~25 | SSE + email + Telegram, digest, web push (опц.) |
| Reporting | ~30 | 5 форматов, scheduled, dashboards 3-х уровней |
| Audit | ~12 | Search, retention, legal hold |
| Gateway | ~10 | Universal operations, JWKS, health agg |
| **Итого** | **~300** | |

## Roadmap соответствие КТ-1 §9

См. `00-OVERVIEW.md` §7.

## Связанные источники

- `PlagLens_КТ-1.pdf` — исходный архитектурный отчёт (в корне).
- Memory: `architecture_decisions.md` — зафиксированные решения после уточнений.
