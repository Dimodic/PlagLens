# PlagLens — Plagiarism Service

Orchestrates plagiarism providers (Dolos), stores normalized pair/cluster
results, manages the cross-course fingerprint corpus and suspicious-flag lifecycle.

## Quick start

```bash
pip install -e ".[dev]"
alembic upgrade head
uvicorn plagiarism_service.main:app --reload --port 8080
```

## Provider matrix

| Provider | Status     | Notes |
|----------|------------|-------|
| Dolos    | functional | CLI subprocess + CSV parsing; `DOLOS_BIN_PATH` selects the binary |

## Layout

```
src/plagiarism_service/
  api/v1/        runs, reports, submission_view, corpus, suspicious,
                 provider_admin, assignment_config, webhooks
  providers/     base.py, dolos.py
  services/      orchestrator, corpus_service, suspicious_service
  events/        Kafka producer/consumer (subscribes to submission events)
  tasks/         Celery tasks (plagiarism queue)
  models/        SQLAlchemy ORM (schema=plagiarism)
  repositories/  data access
  schemas/       Pydantic request/response models
  common/        config, RBAC, problem details, pagination
```

## Endpoints (≥30)

Grouped: A. Runs, B. Reports/pairs/clusters/artifacts, C. Per-submission, D. Corpus,
E. Suspicious, F. Provider admin, G. Per-assignment config, H. Webhooks (in/out), I. Health.
Run `python -m plagiarism_service.tools.list_routes` (or `pytest tests/test_health.py -k count`)
to dump the full route map.

## Testing

```bash
pytest -q
ruff check src tests
python -m compileall src
```
