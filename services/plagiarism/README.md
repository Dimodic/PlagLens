# PlagLens — Plagiarism Service

Orchestrates plagiarism providers (JPlag, MOSS, Codequiry, Dolos), stores normalized pair/cluster
results, manages the cross-course fingerprint corpus and suspicious-flag lifecycle.

See `docs/architecture/legacy/08-PLAGIARISM.md` for the full spec (~30 endpoints).

## Quick start

```bash
pip install -e ".[dev]"
alembic upgrade head
uvicorn plagiarism_service.main:app --reload --port 8080
```

## JPlag runtime requirement

The default plagiarism provider is **JPlag**, a Java tool. The Docker image installs
`default-jre-headless` and downloads the official JPlag fat-jar (pinned to
**v5.1.0** by default) from
`https://github.com/jplag/JPlag/releases/download/v${JPLAG_VERSION}/jplag-${JPLAG_VERSION}-jar-with-dependencies.jar`
into `/opt/jplag.jar`. The path is controlled by the `JPLAG_JAR_PATH` env var
(default `/opt/jplag.jar`); the version can be overridden at build time via
`--build-arg JPLAG_VERSION=5.1.0`. The build runs `java -jar /opt/jplag.jar --help`
as a smoke check, so a broken JAR or missing JRE fails the image build.

When running locally without Docker, install a JDK/JRE 17+ and either:
- download the JPlag release jar and set `JPLAG_JAR_PATH=/path/to/jplag-5.1.0-jar-with-dependencies.jar`, or
- mock `plagiarism_service.providers.jplag._spawn_jplag` in tests (no JVM needed).

## Provider matrix

| Provider   | Status     | Notes |
|------------|------------|-------|
| JPlag      | functional | Subprocess via `java -jar`, parses output zip JSON |
| Codequiry  | functional | HTTP 4-step flow: create → upload → start → poll |
| MOSS       | skeleton   | Stanford MOSS network protocol over TCP |
| Dolos      | skeleton   | CLI subprocess + CSV parsing |

## Layout

```
src/plagiarism_service/
  api/v1/        runs, reports, submission_view, corpus, suspicious,
                 provider_admin, assignment_config, webhooks
  providers/     base.py, jplag.py, moss.py, codequiry.py, dolos.py
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

JPlag subprocess spawn is mocked at `plagiarism_service.providers.jplag._spawn_jplag` in
tests. A realistic v5 result-zip fixture is produced by
`tests/fixtures/sample_jplag.build_jplag_v5_zip()`.
