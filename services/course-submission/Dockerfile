# syntax=docker/dockerfile:1.6
# Merged course+submission service.
# Build context MUST be the project root (so we can COPY libs/ + both services).
# Example: docker build -f services/course-submission/Dockerfile -t plaglens/course-submission .

# ---- Stage 1: builder ----
FROM python:3.12-slim-bookworm AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Build wheels for the shared lib + both source services + the merged service.
COPY libs/plaglens-common /opt/plaglens-common
RUN pip install --upgrade pip wheel build \
    && pip wheel --wheel-dir /wheels /opt/plaglens-common

COPY services/course /opt/course
RUN pip wheel --wheel-dir /wheels --find-links /wheels /opt/course

COPY services/submission /opt/submission
RUN pip wheel --wheel-dir /wheels --find-links /wheels /opt/submission

COPY services/course-submission/pyproject.toml ./
COPY services/course-submission/src ./src
RUN pip wheel --wheel-dir /wheels --find-links /wheels .

# ---- Stage 2: runtime ----
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SERVICE_NAME=course-submission

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 plaglens \
    && useradd --system --uid 10001 --gid plaglens --home /app --shell /sbin/nologin plaglens

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels plaglens-course-submission-service && \
    rm -rf /wheels

# Alembic for both schemas (one DB, two schemas: course + submission).
COPY services/course/alembic ./course_alembic
COPY services/submission/alembic ./submission_alembic
COPY services/course-submission/course_alembic.ini ./course_alembic.ini
COPY services/course-submission/submission_alembic.ini ./submission_alembic.ini
COPY services/course-submission/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R plaglens:plaglens /app

USER plaglens

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
