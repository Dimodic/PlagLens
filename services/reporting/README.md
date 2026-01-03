# PlagLens Reporting Service

Combines Export Service + Dashboard Service. Generates exports (CSV/XLSX/JSON/PDF/Google Sheets), serves cached dashboards, and maintains denormalised read-models from Kafka events.

## Highlights

- All exports go through async Operation pattern (POST -> 202 + Operation, signed URL on download with TTL 5 min).
- Read-models are owned tables in schema `reporting`; Kafka consumers update them idempotently via `processed_events`.
- Dashboards never touch upstream services; they read only from local read-models.
- Redis cache: 5 min for overview, 1 min for detailed views; invalidated on key events.
- APScheduler (PG JobStore) drives scheduled exports + daily MinIO cleanup + read-model lag check.
- Google Sheets sync via `batchUpdate` (max 100 cells per request, service-account auth).

## Layout

```
src/reporting_service/
  api/v1/                  # exports, dashboards, scheduled, read-models, audit-proxy
  exports/formats/         # csv / xlsx / json / pdf / google_sheets
  exports/builders/        # assignment_grades, course_summary, plagiarism, ai, audit
  dashboards/              # course / tenant / global + aggregator
  read_models/             # Kafka -> read-model handlers
  events/                  # CloudEvents producer + consumer
  models/, schemas/, services/, repositories/
  common/                  # rbac, problem, idempotency, ids, pagination, ...
```

Schema: `reporting` (everything in one schema for simplicity).

## Run

```
pip install -e .[dev]
alembic upgrade head
uvicorn reporting_service.main:app --reload
pytest -q
ruff check src/ tests/
```
