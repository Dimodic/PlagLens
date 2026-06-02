# Autosync — Yandex.Contest

Production-grade in-process scheduler that polls every active Yandex.Contest
integration and reconciles participants & submissions into PlagLens.

## Components

```
identity-service ──── POST /v1/auth/service-token (X-Service-Secret) ──> JWT (24h, admin)
                                                                           │
integration-service                                                        ▼
   ┌─ services/service_token.py  ── caches the bearer in-process ──────┘
   │
   └─ services/scheduler.py
        APScheduler (FastAPI lifespan) → tick every SCHEDULER_INTERVAL_SECONDS
        ├─ Redis lock `lock:autosync:tick` (NX EX SCHEDULER_LOCK_TTL_SECONDS)
        ├─ SELECT every active yandex_contest IntegrationConfig (cross-tenant)
        └─ for each config:
            ├─ GET course-service /api/v1/courses/{course_id}/homeworks
            │    └─ extract `contest_id=NNN` from each homework.description
            ├─ for each contest_id:
            │   ├─ adapter.import_participants  → identity bulk-import → course :batchCreate
            │   └─ adapter.import_submissions   → counts + cursor
            └─ INSERT ImportJob (trigger=scheduled, status, stats)
```

## Configuration

Set in `infra/.env` (read by docker-compose):

```bash
ENABLE_SCHEDULER=true                   # default true
SCHEDULER_INTERVAL_SECONDS=300          # default 5 min
SCHEDULER_LOCK_TTL_SECONDS=600          # default 10 min — tick mustn't run longer
SERVICE_AUTH_SECRET=…rotate-me…         # shared with identity-service
```

Restart `integration` to apply: `docker compose up -d --force-recreate integration`.

## Manual operations

* **Force a tick now** (without UI):
  ```bash
  docker exec plaglens-integration python -c \
    "import asyncio; from integration_service.services.scheduler import _run_tick; asyncio.run(_run_tick())"
  ```
* **List recent jobs** (any teacher/admin):
  ```
  GET /api/v1/integrations/{config_id}/import-jobs?limit=20
  ```
* **Read locks**:
  ```bash
  docker exec plaglens-redis redis-cli get lock:autosync:tick
  ```

## What's persisted

* `integration.import_jobs` — every tick records one row per config with
  `trigger=scheduled`, `status`, `started_at`, `finished_at`, `stats` (JSON):
  - `contests`               — homeworks with a parsed contest_id
  - `participants_imported`  — sum across all contests
  - `users_created` / `users_existing` — identity bulk-import outcome
  - `members_enrolled`       — course `:batchCreate` outcome
  - `submissions_fetched`    — count from YC `/submissions` (counts only)
  - `failures`               — non-fatal errors during the run

* `integration.integration_configs.cursor` — JSON map advanced after each
  successful submission pull, keyed by `yc:{contest_id}:submissions`. Lets the
  next tick fetch only deltas.

## What's NOT yet implemented (Phase 5 follow-up)

`submissions_fetched` counts new posylki, but it does **not** ingest source
code into submission-service. To finish the loop:

1. **`adapter.fetch_submission_source(contest_id, run_id)`** — `GET
   /api/public/v2/contests/{cid}/submissions/{run_id}/source`. Returns raw
   bytes + filename + language.
2. **assignment ↔ contest_id+problemAlias mapping** — store
   `{provider:'yandex_contest', contest_id, problem_alias}` in
   `course.assignments.external_bindings` so the scheduler can look up the
   target assignment for each submission.
3. **Per-author ZIP builder** — group new submissions by `(assignment_id,
   user_login)`, build a ZIP `<login>/<filename>`, POST to
   `submission-service /api/v1/assignments/{asg_id}/submissions:batchCreate`
   (already exists, accepts ZIP).
4. **Login → user_id resolution** — identity already exposes users by
   `external_id` after `/v1/users/bulk-import`; the integration scheduler
   should query identity instead of relying on email synthesis.

Once steps 1–4 land, set `cfg.cursor` advance to `(max_run_id, last_seen_run_id)`
and the system becomes truly real-time.

## Stepik (future)

Stepik supports webhooks (`progress.created`) but requires a public callback
URL. The plumbing is sketched in `integration_service.adapters.stepik` and
`api/v1/webhooks.py`; finishing it requires:

* exposing the integration-service via traefik (or ngrok in dev)
* documenting the registration step in Stepik admin
* mapping Stepik step → assignment (similar to YC)

## Health & observability

* `import_jobs.error.detail` carries the first 3 errors of a failed run.
* `scheduler.tick_start / tick_done` are JSON-structured logs (structlog).
* Lock contention shows as `scheduler.tick_skipped reason=lock_held` —
  benign, expected when running >1 replica of integration-service.
