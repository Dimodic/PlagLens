# PlagLens Notification Service

Aggregates domain events from Kafka and dispatches user notifications via three channels:
**in-app** (DB + SSE), **email** (Mailgun), and **Telegram** (aiogram bot).

## Stack

- Python 3.12+, FastAPI, Pydantic v2
- SQLAlchemy 2.x async + asyncpg + Alembic
- redis-py async (pub/sub + ZSET for delayed delivery)
- aiokafka (multi-topic consumer over all upstream services)
- structlog, httpx, prometheus-client
- sse-starlette (real-time fanout)
- jinja2 (templates per event/locale/channel)
- aiogram 3.x (Telegram bot)
- apscheduler (digest tick)

## Running

```bash
pip install -e .[dev]
alembic upgrade head
uvicorn notification_service.main:app --port 8080
```

Tests: `pytest -q`. Lint: `ruff check src/ tests/`.

## Architecture

- `consumers/dispatcher.py` — fan-in Kafka consumer subscribed to all upstream topics
  (identity/course/submission/integration/plagiarism/ai/operation/reporting). Each event is
  passed through `rule_engine.py` which figures out recipients, filters by user preferences and
  quiet-hours, then enqueues per-channel deliveries.
- `channels/{inapp,email,telegram}.py` — concrete `Channel.send()` impls. Email via Mailgun
  REST + retries; Telegram respects `429 retry_after`; in-app inserts a row and `PUBLISH`es to
  `sse:user:{user_id}` Redis channel.
- `api/v1/stream.py` — SSE endpoint, subscribes to `sse:user:{user_id}` and forwards as
  `text/event-stream`. Heartbeat every 25s. `Last-Event-ID` triggers DB replay.
- `digest/` — APScheduler job collects unread per period and emails one digest per user.
- `templates/` — Jinja2 per `(event_type, locale, channel)` with safe defaults.
- `events/` — CloudEvent envelope + `processed_events` dedup.

## Endpoints

All under `/api/v1` (see §A through §J in `docs/architecture/10-NOTIFICATION.md`):
notifications CRUD, SSE stream, preferences, test, templates admin, email config admin,
telegram config admin, digest, web push, observability admin, plus health.
