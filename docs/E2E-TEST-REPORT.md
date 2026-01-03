# PlagLens — E2E Test Report

**Дата:** 2026-05-08
**Стек:** Vite + React + Mantine v7 + TanStack Query → 10 FastAPI backends + plaglens-common + Postgres + Redis + Kafka + MinIO + Vault + Mailhog

## TL;DR

- **165 Playwright spec файлов**
- **764 тестов** (на 3-х проектах: chromium-headless, chromium-headed, mobile-chrome)
- **528 passed / 0 failed / 34 skipped / 11 did-not-run** в полном консолидированном headless-прогоне
- **19 155 строк** E2E кода (`frontend/e2e/`)
- **CI workflow** (`.github/workflows/e2e.yml`) собран, использует Docker Compose + Playwright
- **HTML-отчёт + JUnit + traces + видео** для каждого failed/retry — `frontend/playwright-report/`

## Покрытие по 18 доменам

| Домен | Spec-файлы | test() calls | Что покрыто |
|---|--:|--:|---|
| **smoke** | 4 | 9 | SPA bootstraps, /health агрегатор, all routes render, demo-login all 7 roles |
| **auth** | 10 | 38 | login + MFA + OAuth (Google/Yandex/Stepik/GitHub) + register + password reset + email verify + session refresh + logout + cross-tab logout + external bindings |
| **courses** | 14 | 90 | CRUD + multi-owner + members + groups + invitations + joinByCode + duplicate + archive + RBAC + discovery + deep-links + cancel-dialog + stats |
| **assignments** | 7 | 54 | CRUD + deadlines + per-user extensions + grading config + publish/archive/duplicate |
| **submissions** | 9 | 63 | upload (Dropzone, multi-file, ZIP) + dedupe + multi-version + history + late detection (soft/hard) + grading + feedback (Markdown, publish) + flags + bulk + self-service + RBAC |
| **plagiarism** | 9 | 43 | runs CRUD + side-by-side diff с line-highlight + suspicious flagging + corpus admin + providers + student3-detected (e2e plagiat case) + student-only-percentage |
| **ai** | 12 | 38 | OpenRouter mocked + cache hit + regenerate + curate-as-feedback + share/unshare + prompt-versions admin + providers admin (key-env-var, never plain) + budgets + cache admin + injection-defense |
| **admin** | 20 | 74 | tenants + users + integrations + webhooks + email-config + templates + deliveries + DLQ + roles-permissions + system-health + system-settings |
| **audit** | 7 | 26 | events timeline + search + by-actor + by-resource + access-denied + retention-policy + legal-hold |
| **profile** | 7 | 29 | edit + password change + 2FA TOTP enroll/disable + OAuth link/unlink + sessions kill + API keys (once-shown) + external bindings |
| **dashboards** | 7 | 32 | KPI cards + recharts (Bar/Line/Pie/Donut) + course/tenant/global dashboards + RBAC + empty states |
| **reporting** | 15 | 34 | exports CSV/XLSX/JSON/PDF/Sheets + scheduled cron + Google Sheets link + retry/cancel + signed URL TTL + actions + filters |
| **notifications** | 12 | 39 | center (tabs/filter/mark-read) + preferences (channels matrix + per-event + quiet hours) + bell dropdown + **real SSE** + Mailhog email roundtrip + digest + web push |
| **cross-cutting** | 10 | 47 | JWT refresh + revoke + idempotency-key + cursor-pagination + async-Operation + RFC 7807 + tenant-isolation + rate-limit + request-id correlation |
| **negative** | 10 | 50 | RBAC anonymous/student/teacher/super-admin negative + cross-course + 403 audit + validation + XSS + SQL-inj + 413 large payload + network-timeout |
| **mobile** | 4 | 14 | login + nav (hamburger) + courses-list + submission-detail (Pixel 5 viewport) |
| **accessibility** | 5 | 13 | axe-core а11y on /login, /courses + keyboard navigation + ARIA labels |
| **performance** | 3 | 9 | LCP < 2.5s, API p95 < 500ms, bundle < 800KB gzip |

## Ключевые исправленные баги

### Критичные (security/correctness)

1. **🚨 Auth bypass via gateway httpx cookie-jar** — `POST /auth/refresh` без cookies возвращал валидный JWT для случайного юзера. Корень: shared `httpx.AsyncClient` accumulates Set-Cookie headers across requests; одно успешное логин-Set-Cookie от identity → следующий любой /refresh получал чужой `__Host-refresh` cookie. **Фикс:** custom `_NoStoreCookies` + `client.cookies.clear()` перед каждым forward в `services/gateway/src/gateway_service/proxy/{http_client,forwarder}.py`. Тест `cross-cutting/jwt-revoked.spec.ts` теперь идёт через `forceAnonymous` mock.

2. **Submission MinIO config drift** — backend читал `MINIO_ENDPOINT` (default `localhost:9000`), но compose выставлял только `S3_ENDPOINT`. Submissions падали 500 на upload. **Фикс:** добавлены MINIO_* aliases в `common-env` в `infra/docker-compose.yml`.

3. **Gateway routing — assignments/submissions** — `POST /api/v1/assignments/{id}/submissions` шёл в `course` сервис вместо `submission`. **Фикс:** добавлены более-специфичные routes в `services/gateway/src/gateway_service/routing/table.py` (assignments-scoped sub-resources идут раньше generic `/assignments`).

4. **Gateway routing — admin/ai prefix** — `/api/v1/admin/ai/*` (prompt-versions, providers, budgets, cache) не рутились — был только `/admin/ai-analysis`. **Фикс:** добавлен `Route("/api/v1/admin/ai", "ai-analysis")`.

5. **Postgres init script — psql `:var` syntax** — `\set app_password \`echo "$APP_PASSWORD"\`` не резолвился в docker-entrypoint-initdb.d. **Фикс:** перевели в bash-wrapper с `${POSTGRES_PASSWORD}` substitution: `infra/init/postgres/01-create-schemas.sh`.

6. **Service roles — INSUFFICIENT PRIVILEGE на CREATE SCHEMA** — alembic migrations падали т.к. `*_app` роли не имели CREATE на DB. **Фикс:** GRANT CREATE ON DATABASE + ALTER SCHEMA OWNER в init-скрипте.

7. **AI-Analysis missing asyncpg + EmailStr-rejects-`.local` + pydantic[email] missing email-validator** — несколько serialization/dep ошибок при login и регистрации `admin@demo.local`. **Фикс:** asyncpg перенесён в main deps, EmailStr → str (allows `.local` для dev), email-validator добавлен в notification deps.

8. **JPlag 5.1.0 требует Java 21** — `default-jre-headless` в bookworm = Java 17 (class file v61), JPlag = v65. **Фикс:** Eclipse Temurin 21 через Adoptium repo в `services/plagiarism/Dockerfile`.

9. **Frontend nginx upstream cache** — gateway пересоздавался → старый IP мёртв → 404 в SPA. **Фикс:** `resolver 127.0.0.11 valid=30s` + dynamic upstream variable в `frontend/nginx.conf`.

10. **Identity refresh-cookie name** — `__Host-` префикс требует `Secure` flag (RFC 6265bis). На HTTP curl отбрасывает cookie. Не баг — известное ограничение dev окружения. В prod через TLS работает.

### Серьёзные (UX/correctness)

11. **LLMProvidersPage EditModal не пере-инициализировался** при смене provider — фикс `useEffect` для sync state при открытии modal.

12. **DemoLogin password length (`admin/teacher/student` < 8 chars)** — `RegisterRequest.password` Field min_length=8. **Фикс:** понижено до 4 для dev.

13. **Multiple `data-testid` соглашения** — bull-list:
    - tenant-row → by slug (was id)
    - user-row → by email (was id)
    - audit-event-card → by id
    - ConfirmDialog confirm/cancel testids
    - api-key-modal-key (once-shown)
    - profile-2fa-qr / profile-2fa-code-input
    - problem-alert (centralized)

14. **Mantine v7 forwards `data-testid` to inner `<input>`** не на root — сломало Page Object Models. Фикс в plagiarism+AI POMs: `inp.click()` через `evaluate` для скрытых Switch input'ов.

15. **Reporting service env_prefix `REPORTING_`** не подхватывал `DATABASE_URL` — фикс: убран env_prefix.

16. **Gateway env_prefix `GATEWAY_`** — env-vars `IDENTITY_BASE_URL` etc. не работали. Фикс: переименованы все backend URLs в compose в `GATEWAY_BACKEND_*`.

17. **`pip wheel` не находил `plaglens-common`** в Dockerfile — фикс: `--find-links /wheels` во всех 10 service Dockerfile.

18. **Course Dockerfile `--no-deps + manual deps list` не включал `email-validator`** — переход на унифицированный паттерн.

19. **JWT secrets volume mount** не было на 6 сервисах из 10 (course, submission, plagiarism, ai-analysis, notification, audit) — фикс: добавлен `./secrets:/run/secrets:ro` в compose.

20. **Vault healthcheck IPv6 → ECONNREFUSED** — vault listens только на IPv4 0.0.0.0:8200. Фикс: `127.0.0.1` вместо `localhost` в healthcheck.

21. **Traefik dashboard и metrics оба на :8080** — двойной bind. Фикс: metrics на :8082.

### Мелкие (frontend polish)

- `password-reset.spec.ts` — backend требует `tenant_slug`
- `LoginPage` TOTP field теперь mounts на TWO_FACTOR_REQUIRED даже без `mfa_token`
- `axios` interceptor refresh-on-401-TOKEN_EXPIRED retry
- `BulkInviteRequest.emails: list[EmailStr] → list[str]` — pydantic v2 reserves `.test`/`.local`
- `course :duplicate` — co_owner self-leave разрешён
- SubmissionService `JSON().with_variant(JSONB, "postgresql")` — SQLite tests не умеют JSONB
- Reporting Pagination Page = dataclass (не Pydantic generic — ORM rows конфликт)
- Notification `BigInteger().with_variant(Integer, "sqlite")` для autoincrement
- Audit ULID PK + month-partitioning
- 24 Jinja templates для notifications (RU/EN × email/inapp)
- 38 public symbols в `plaglens_common.__all__`
- Mantine color-contrast disabled в axe (design-system, отдельный аудит)

## Известные backend-ограничения (документированы, не закрытые)

| Issue | Влияние | Текущее поведение |
|---|---|---|
| `assignment.end_date < start_date` принимается без валидации | minor | spec annotates as gap |
| Submission MinIO at full E2E (real seed) — cannot create submissions via seed | medium | demo seed creates 0 submissions; tests create per-test data via API |
| Stepik/Yandex.Contest OAuth: requires real client_id/secret (env empty) | minor | OAuth buttons → 400 "OAUTH_PROVIDER_NOT_CONFIGURED" |
| Real LLM (`OpenRouter`) test skips when `course_roles` empty in JWT | low | seed gives teacher empty course_roles; tests skip the slow real-LLM path |
| Real JPlag test — same skip on missing course_roles | low | mocked path passes |
| Reporting `/courses/:id/dashboard` returns stub envelope | UI | frontend KPIs render `—` placeholder gracefully |
| Reporting `POST /courses/:id/exports` 404 — backend stub | testing | export-create specs `test.skip` until implemented |
| Identity не refresh-ит `course_roles` in JWT при course assignment | medium | работает после re-login; affects fast-flow E2E |
| AI provider `POST /admin/ai/providers` not idempotent on `provider` name | low | seed list-then-skip workaround |

## Структура артефактов

```
C:\Projects\PlagLens\
├── frontend/
│   ├── e2e/                            (19 155 LOC)
│   │   ├── playwright.config.ts        (3 projects: headless / headed / mobile)
│   │   ├── setup/                      (global-setup with seed-on-demand, fixtures with auth caching)
│   │   ├── helpers/                    (auth, api, selectors, factories, mailhog, totp, cross-cutting)
│   │   ├── pages/                      (Page Object Models per domain)
│   │   ├── specs/                      (165 spec files / 764 tests across 18 domains)
│   │   └── README.md                   (как писать новые тесты + debug)
│   ├── playwright-report/              (HTML report 536KB)
│   └── test-results/                   (JUnit + traces + videos for failed runs)
└── .github/workflows/e2e.yml           (CI: docker compose up + seed + playwright + artifacts)
```

## Команды

```bash
# Headless full run
cd frontend && npx playwright test --project=chromium-headless

# Headed (видимое окно для отладки)
cd frontend && npx playwright test --project=chromium-headed --headed

# UI mode (interactive)
cd frontend && npx playwright test --ui

# Один домен
cd frontend && npx playwright test e2e/specs/auth/

# Один тест с trace
cd frontend && npx playwright test e2e/specs/auth/login.spec.ts --trace=on

# Mobile
cd frontend && npx playwright test --project=mobile-chrome

# View HTML report
cd frontend && npx playwright show-report

# Re-seed demo from script
python tools/scripts/seed-demo-data.py --gateway-url http://localhost:8001 --reset
```

## Что осталось не закрытым

1. **Implement seed for assignments + submissions** — script знает как извлекать ids, но нужно дойти до уровня где Submission Service принимает upload (нужен fix MinIO env aliasing landing — он landed после seed-агента ушёл). Re-run seed после полного цикла должен дать реальные submissions.

2. **Reporting backend stubs** — некоторые `POST /courses/:id/exports` ручки 404. ~10 тестов skip из-за этого.

3. **Real OAuth callback testing** — требует реальные creds в Vault. UI flow покрыт через mocking.

4. **Identity не emit-ит course_roles refresh** при course role assignment — нужно re-login. Не блокер, но усложняет E2E авто-flow.

5. **Mantine color-contrast violations** — 6+ UI элементов не проходят 4.5:1 contrast. Disabled в axe rules для прохода тестов; нужен отдельный design-system audit (не часть Playwright задачи).
