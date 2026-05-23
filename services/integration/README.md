# PlagLens Integration Service

Adapter-pluggable service for importing submissions from external systems
(Stepik, Yandex.Contest), manual ZIP/CSV uploads, Telegram bot binding and
Google Sheets linking. Hosts incoming webhooks and scheduled (cron) imports.

## Stack

- Python 3.12+, FastAPI, Pydantic v2
- SQLAlchemy 2.x async + asyncpg + Alembic (schema `integration`)
- redis-py async (OAuth state, access-token cache)
- aiokafka (consumer + producer)
- httpx (Stepik/Y.Contest)
- authlib (OAuth flows)
- aiogram (Telegram bot, optional)
- google-api-python-client (Sheets, optional)
- APScheduler / Celery + redbeat (scheduled imports)
- structlog, prometheus-client

## Running locally

```bash
pip install -e .[dev]
alembic upgrade head
uvicorn integration_service.main:app --reload --port 8080
```

`pytest -q` executes the offline test-suite (mocked HTTP, in-memory SQLite).

## Layout

```
src/integration_service/
  main.py             # FastAPI app, lifespan
  config.py           # Settings (env)
  deps.py             # FastAPI dependencies
  common/             # Local copies: db, kafka, problems, auth stub
  adapters/           # base + stepik / yandex_contest / manual / telegram / google_sheets
  api/v1/             # Routers (~35 endpoints)
  models/             # SQLAlchemy ORM
  schemas/            # Pydantic DTO
  repositories/       # DB access
  services/           # Use-case layer
  pollers/            # APScheduler / Celery tasks
  events/             # Kafka producer / consumer
```

## Endpoints (summary)

- Configs CRUD + `:test`/`:enable`/`:disable`
- OAuth start / callback / refresh / disconnect
- Stepik specifics (courses / lessons / steps / sync-structure)
- Yandex.Contest specifics (contests / problems / participants / sync-structure)
- Manual upload (ZIP / CSV / templates)
- Sync (run + jobs CRUD + cancel/retry)
- Schedules CRUD + run-now
- Telegram binding (start / confirm / me / delete + admin bot-settings)
- Google Sheets (spreadsheets + per-course link CRUD + validate)
- Webhooks (stepik / yandex / telegram / plagiarism / llm)
- Cursor admin (get / reset / set)
- Admin health / webhook-events / dlq + standard `/healthz`, `/readyz`,
  `/metrics`, `/v1/version`

## Yandex.Contest OAuth — dev setup

The adapter calls `https://api.contest.yandex.net/api/public/v2/...` with
`Authorization: OAuth <token>`. Tokens are stored in Redis under
`oauth:token:{config_id}:access` (TTL = `expires_in − 60s`) and
`...:refresh` (no TTL).

### 1. Register an OAuth app at Yandex

1. Open https://oauth.yandex.ru/client/new.
2. Platform: **Веб-сервисы**. Redirect URI: `http://localhost:5173/auth/oauth/callback`.
3. Scopes (search "contest"):
   - `contest:manage` — required (read participants, runs, contests).
   - `contest:submit` — optional (only if you ever programmatically submit).
4. Copy `Client ID` and `Client secret`.

### 2. Wire up secrets locally

```bash
cp services/integration/.env.example services/integration/.env.local
# edit .env.local — paste your real client_id / client_secret
```

`.env.local` is gitignored via root `.gitignore` (`.env.*`). The
`docker-compose.yml` integration service loads it via:

```yaml
env_file:
  - path: ../services/integration/.env.local
    required: false
```

### 3. Start / restart the service

```bash
docker compose -f infra/docker-compose.yml up -d --force-recreate integration
```

Verify the secret made it inside:

```bash
docker exec plaglens-integration python -c \
  "from integration_service.config import get_settings as g; \
   s = g(); print(bool(s.yandex_contest_oauth_client_id), s.yandex_contest_oauth_scope)"
```

Should print `True contest:manage`.

### 4. OAuth flow (end-to-end)

1. Front (or curl) creates an `IntegrationConfig` with `kind=yandex_contest`
   on a course you own:
   `POST /api/v1/integrations/configs` → `{config_id}`
2. Front asks for the authorize URL:
   `GET /api/v1/integrations/{config_id}/oauth/start` → `{authorize_url, state}`
3. Front redirects the user to `authorize_url`.
4. Yandex redirects back to `http://localhost:5173/auth/oauth/callback?code=…&state=…`.
5. Front passes `code+state` to the backend:
   `GET /api/v1/integrations/oauth/finalize?code=…&state=…`
6. Backend exchanges code for tokens, stores them, marks config `active`.

### 5. Use the token to import data

```bash
# list contests visible to the token
GET  /api/v1/integrations/yandex-contest/{config_id}/contests

# preview participants of a contest
GET  /api/v1/integrations/yandex-contest/{config_id}/contests/73433/participants

# import participants (currently returns the parsed list; bulk-create into
# identity-service + bulk-add into course-service is wired in a follow-up)
POST /api/v1/integrations/yandex-contest/{config_id}/contests/73433/import-participants
```

### Limitations / known follow-ups

- **`POST .../import-participants`** currently returns the parsed list only.
  Wiring it through to `identity-service`'s `bulk-import` and
  `course-service`'s `bulk-add` is a follow-up (those endpoints don't exist
  yet).
- Refresh token is stored but no scheduler refreshes proactively — call
  `POST /integrations/{config_id}/oauth/refresh` from the frontend on
  401 to renew.
- Yandex.Contest does not push webhooks; submissions are pulled by
  scheduled `import_submissions` (see `services/scheduler.py`).
- The OAuth scope `contest:manage` is required to read participants and
  runs; the token owner must additionally be admin/jury on the target
  contest. A regular contestant token will get 403 from the participants
  endpoint.
