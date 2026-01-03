# syntax=docker/dockerfile:1.7
# Build context MUST be the project root.
# Example: docker build -f services/course/Dockerfile -t plaglens/course .

FROM python:3.12-slim-bookworm AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip build hatchling
# Build the shared library wheel first.
COPY libs/plaglens-common /opt/plaglens-common
RUN pip wheel --wheel-dir /wheels /opt/plaglens-common
COPY services/course/pyproject.toml services/course/README.md ./
COPY services/course/src ./src
RUN pip wheel --wheel-dir /wheels --find-links /wheels .

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SERVICE_NAME=course

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system app && useradd --system --gid app --home /app --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links /wheels plaglens-course-service \
    && rm -rf /wheels
COPY services/course/alembic /app/alembic
COPY services/course/alembic.ini /app/alembic.ini
COPY services/course/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R app:app /app

USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
