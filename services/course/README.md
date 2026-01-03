# Course Service (PlagLens)

Manages courses, owners, members, invitations, groups, **homeworks**, assignments,
deadlines and grading configuration. Multi-tenant; isolated by `tenant_id`.

## Models hierarchy

```
Course
 ├── CourseOwner / CourseMember / CourseInvitation
 ├── Group → GroupMember
 └── Homework  (slug, title, position, status, due_at)
      └── Assignment  (FK homework_id, optional; FK course_id kept for RBAC)
```

A Homework groups Assignments of one week / topic. ``assignments.course_id`` is
intentionally retained (denormalized) so RBAC checks that look up
``CourseMember(course_id, user_id)`` keep working without an extra join.

## Stack

Python 3.12 + FastAPI, Pydantic v2, SQLAlchemy 2.x async (+ asyncpg), Alembic, redis-py,
aiokafka, structlog, httpx.

## Layout

```
src/course_service/
  main.py                  # FastAPI app + lifespan + middlewares
  config.py                # pydantic-settings
  deps.py                  # auth, db session, RBAC dependencies
  common/                  # cross-cutting: problem, pagination, idempotency, events
  api/v1/                  # routers
  models/                  # SQLAlchemy models
  schemas/                 # Pydantic schemas
  services/                # business logic
  repositories/            # data access
  events/                  # Kafka producer & consumer
alembic/                   # migrations (single 0001_initial.py creates all tables)
tests/                     # pytest suite (uses SQLite + httpx ASGI)
```

## Run

```bash
pip install -e .[dev]
alembic upgrade head
uvicorn course_service.main:app --reload
```

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://localhost/plaglens_course` | PostgreSQL DSN |
| `REDIS_URL` | `redis://localhost:6379/0` | Idempotency cache |
| `KAFKA_BROKERS` | `localhost:9092` | Event bus |
| `JWT_PUBLIC_KEY_PATH` | `` | RS256 public key (PEM); empty = HS256 dev mode |
| `JWT_HS_SECRET` | `dev-secret` | HS256 secret for local development |
| `INTEGRATION_SERVICE_URL` | `http://integration:8000` | For `external_bindings` validation |
| `KAFKA_ENABLED` | `false` | Disables producer/consumer for tests/local |

## Endpoints

All under `/api/v1`. ~50 routes covering courses (9), owners (4), members (8),
invitations (5 incl. global `:joinByCode`), groups (9), assignments (8), deadlines (6),
grading (4), stats (2), self-service (4), plus `/healthz`, `/readyz`, `/metrics`,
`/v1/version`. Full inventory in `docs/architecture/05-COURSE.md`.

## RBAC

- Global role read from JWT (`global_role`).
- Course role looked up at runtime from local `course.course_owners` and
  `course.course_members` tables, NOT from JWT — guarantees freshness per spec §10.1.

## Events

- **Publishes** to `plaglens.course.course.v1` and `plaglens.course.assignment.v1` topics
  with CloudEvents envelope. See `events/producer.py`.
- **Consumes** `identity.user.deleted.v1`, `identity.user.anonymized.v1`,
  `identity.tenant.deleted.v1` in a background task started in lifespan
  (`events/consumer.py`).

## Deviations from spec

- Some "proxy" endpoints (`/courses/{id}/dashboard`, `/assignments/{id}/stats`) return
  shaped placeholders with `# TODO` markers instead of calling Reporting Service.
- `:duplicate` (course and assignment) creates a shallow copy of the row only;
  deep-copy of nested resources is `# TODO`.
- `external_bindings` validation calls Integration Service via httpx; the call is
  best-effort (warning on failure rather than 502) so the service stays usable in
  isolation. Tests stub the call.
- For local development without Postgres the test suite uses SQLite via aiosqlite;
  Alembic migration is JSON-tolerant so it runs on both backends.
- Idempotency-Key middleware stores the cache in Redis if `REDIS_URL` is reachable,
  falling back to an in-process dict for tests.
- Soft delete cascade (course -> assignments) is performed inline; submissions are
  expected to react to the emitted `course.course.deleted.v1` event.

## Self-check

```bash
python -m compileall src/
ruff check src/
pytest -q
```
