# syntax=docker/dockerfile:1.6
# Merged reporting+audit+notification service.
# Build context MUST be the project root (so we can COPY libs/ + all services).
# Example: docker build -f services/reporting-audit-notification/Dockerfile -t plaglens/reporting-audit-notification .

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

# Build wheels for the shared lib + the three source services + the merged one.
COPY libs/plaglens-common /opt/plaglens-common
RUN pip install --upgrade pip wheel build \
    && pip wheel --wheel-dir /wheels /opt/plaglens-common

COPY services/reporting /opt/reporting
RUN pip wheel --wheel-dir /wheels --find-links /wheels /opt/reporting

COPY services/audit /opt/audit
RUN pip wheel --wheel-dir /wheels --find-links /wheels /opt/audit

COPY services/notification /opt/notification
RUN pip wheel --wheel-dir /wheels --find-links /wheels /opt/notification

COPY services/reporting-audit-notification/pyproject.toml ./
COPY services/reporting-audit-notification/src ./src
RUN pip wheel --wheel-dir /wheels --find-links /wheels .

# ---- Stage 2: runtime ----
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SERVICE_NAME=reporting-audit-notification

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 plaglens \
    && useradd --system --uid 10001 --gid plaglens --home /app --shell /sbin/nologin plaglens

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels plaglens-reporting-audit-notification-service && \
    rm -rf /wheels

# Alembic for all three schemas (one DB, three schemas).
COPY services/reporting/alembic ./reporting_alembic
COPY services/audit/alembic ./audit_alembic
COPY services/notification/alembic ./notification_alembic
COPY services/reporting-audit-notification/reporting_alembic.ini ./reporting_alembic.ini
COPY services/reporting-audit-notification/audit_alembic.ini ./audit_alembic.ini
COPY services/reporting-audit-notification/notification_alembic.ini ./notification_alembic.ini
COPY services/reporting-audit-notification/entrypoint.sh /app/entrypoint.sh
# Strip any CR (defensive: a Windows checkout may carry CRLF, which breaks the
# shebang inside the Linux container). .gitattributes also enforces LF in-repo.
RUN sed -i 's/\r$//' /app/entrypoint.sh \
    && chmod +x /app/entrypoint.sh \
    && chown -R plaglens:plaglens /app

USER plaglens

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl --fail http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
