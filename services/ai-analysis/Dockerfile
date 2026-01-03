# syntax=docker/dockerfile:1.6
# Build context MUST be the project root (so we can COPY libs/plaglens-common).
# Example: docker build -f services/ai-analysis/Dockerfile -t plaglens/ai-analysis .

FROM python:3.12-slim-bookworm AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install the shared library first.
COPY libs/plaglens-common /opt/plaglens-common
RUN pip install --upgrade pip wheel build \
    && pip wheel --wheel-dir /wheels /opt/plaglens-common

COPY services/ai-analysis/pyproject.toml services/ai-analysis/README.md ./
COPY services/ai-analysis/src ./src

RUN pip wheel --wheel-dir /wheels --find-links /wheels .

FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    SERVICE_NAME=ai-analysis

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 plaglens \
    && useradd --system --uid 10001 --gid plaglens --home /app --shell /sbin/nologin plaglens

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels plaglens-ai-analysis-service \
    && rm -rf /wheels

COPY services/ai-analysis/alembic ./alembic
COPY services/ai-analysis/alembic.ini ./alembic.ini
COPY services/ai-analysis/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R plaglens:plaglens /app

USER plaglens

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
