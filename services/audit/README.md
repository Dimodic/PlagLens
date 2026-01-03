# PlagLens Audit Service

Centralized append-only audit log. Consumes ALL Kafka topics from other services
and offers an internal HTTP write API + admin/read API. Implements the spec in
`docs/architecture/12-AUDIT.md`.

## Tech stack

- Python 3.12+, FastAPI, Pydantic v2
- SQLAlchemy 2.x async + asyncpg + Alembic (schema `audit`)
- Redis (idempotency / processed events cache)
- aiokafka (consume all `plaglens.*` topics)
- APScheduler (monthly partition manager + daily retention cleaner)
- structlog (JSON), prometheus-client
- ULID primary keys (`python-ulid`)

## Run locally

```bash
pip install -e .[dev]
alembic upgrade head
uvicorn audit_service.main:app --reload --port 8080
```

## Environment

| Name | Default |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://audit:audit@localhost:5432/audit` |
| `REDIS_URL` | `redis://localhost:6379/3` |
| `KAFKA_BROKERS` | `localhost:9092` |
| `KAFKA_TOPICS` | `plaglens.*` (regex — all PlagLens topics) |
| `KAFKA_GROUP_ID` | `audit-service` |
| `RETENTION_DEFAULT_DAYS` | `365` |
| `RETENTION_LONG_DAYS` | `2555` (7 years) |
| `INTERNAL_SERVICE_TOKEN` | secret |
| `JWT_PUBLIC_KEY_PATH` | `keys/jwt-public.pem` |
| `JWT_AUDIENCE` | `plaglens` |
| `JWT_ISSUER` | `plaglens-identity` |
| `RUN_BACKGROUND_JOBS` | `true` |

## Database hardening (append-only)

The DB user used at runtime should have **only INSERT** on `audit.audit_events`
and SELECT on read tables. The retention cleaner uses a separate role with
DROP TABLE permission for old partitions.

```sql
-- Apply once, on production database, after `alembic upgrade head`:
REVOKE UPDATE, DELETE ON audit.audit_events FROM audit_app;
GRANT  INSERT, SELECT ON audit.audit_events TO audit_app;

CREATE ROLE audit_admin LOGIN PASSWORD '...';
GRANT  USAGE ON SCHEMA audit TO audit_admin;
GRANT  ALL   ON ALL TABLES IN SCHEMA audit TO audit_admin;
-- Used by retention cleaner only (DROP TABLE for expired partitions).
```

In code, no UPDATE or DELETE statement is ever issued against
`audit.audit_events` — every write is `INSERT`. Even error-correction events are
new appended rows.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/api/v1/audit/events` | admin |
| GET | `/api/v1/audit/events/{id}` | admin / owner |
| POST | `/api/v1/audit/events:search` | admin |
| GET | `/api/v1/audit/events/by-actor/{user_id}` | admin / self |
| GET | `/api/v1/audit/events/by-resource/{type}/{id}` | admin / owner |
| GET | `/api/v1/audit/timeline` | admin |
| GET | `/api/v1/courses/{id}/audit` | owner / co_owner |
| GET | `/api/v1/users/{id}/audit` | admin / self |
| GET | `/api/v1/audit/access-denied` | admin |
| POST | `/api/v1/audit/events:export` | admin |
| GET | `/api/v1/admin/audit/retention-policy` | admin |
| PATCH | `/api/v1/admin/audit/retention-policy` | admin |
| GET | `/api/v1/admin/audit/retention-status` | admin |
| POST | `/api/v1/admin/audit/retention:run-now` | super_admin |
| GET | `/api/v1/admin/audit/legal-holds` | admin |
| POST | `/api/v1/admin/audit/legal-holds` | admin |
| DELETE | `/api/v1/admin/audit/legal-holds/{id}` | admin |
| GET | `/api/v1/admin/audit/stats` | admin |
| POST | `/api/v1/audit/events` | service token |
| GET | `/healthz` `/readyz` `/metrics` `/api/v1/version` | public |

## Background jobs

- **Kafka consumer** (lifespan): subscribes by regex pattern to all
  `plaglens.*` topics, deduplicates by `event.id`, persists each event as
  `AuditEvent`.
- **Partition manager** (cron, monthly): pre-creates the next month partition
  `audit.audit_events_YYYY_MM`.
- **Retention cleaner** (cron, daily): for each partition older than its
  `retention_class` days, DROPs the partition table — unless any
  `LegalHold` covers a `resource_id` in that partition.

## Tests

```bash
pytest -q
```

Tests use SQLite (`aiosqlite`); partitioning DDL is automatically skipped on
non-PostgreSQL dialects via SQLAlchemy event listeners.
