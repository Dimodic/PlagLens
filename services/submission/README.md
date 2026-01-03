# PlagLens Submission Service

Stores all submission versions, files (in MinIO), grades, feedback, and flags.

## Stack
Python 3.12+, FastAPI, Pydantic v2, SQLAlchemy 2.x async + asyncpg + Alembic,
redis-py async, aiokafka, MinIO S3 client, structlog, httpx.

## Endpoints

Base: `/api/v1`. ~35 endpoints covering:
- Submissions (read/write, manual upload, history, diff, latest/best/selected per student)
- Files (list, content, syntax-highlighted)
- Grading (set/patch/remove + history; late-penalty/hard-deadline rules)
- Feedback (CRUD, publish/unpublish, from-LLM)
- Flags (suspicious, llm_attention, manual)
- Bulk: batchCreate, batchUpdate, batchPublish, batchSelect (all 202 + Operation)
- Student self-service `/users/me/...`
- Course views: flagged-submissions per course/assignment
- Health: `/healthz`, `/readyz`, `/metrics`, `/v1/version`

## Storage layout

```
plaglens-{tenant_slug}/submissions/{yyyy}/{mm}/{dd}/sub_{id}/
  file_{file_id}_{filename}
```

## Events
Publishes: `submission.submission.created/deleted.v1`,
`submission.grade.assigned/changed/removed.v1`, `submission.feedback.added.v1`.
Consumes: `course.assignment.deleted.v1`, `identity.user.anonymized.v1`,
`identity.user.deleted.v1`, `plagiarism.run.completed.v1`,
`ai.analysis.completed.v1`.

## Run

```bash
pip install -e ".[dev]"
alembic upgrade head
uvicorn submission_service.main:app --reload --port 8080
pytest -q
ruff check src/
```
