# syntax=docker/dockerfile:1.6
# Build context MUST be the project root (so we can COPY libs/plaglens-common).
# Example: docker build -f services/plagiarism/Dockerfile -t plaglens/plagiarism .

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

# Install the shared library first so the service wheel can resolve `plaglens-common`.
COPY libs/plaglens-common /opt/plaglens-common
RUN pip install --upgrade pip wheel build \
    && pip wheel --wheel-dir /wheels /opt/plaglens-common

COPY services/plagiarism/pyproject.toml services/plagiarism/README.md ./
COPY services/plagiarism/src ./src

RUN pip wheel --wheel-dir /wheels --find-links /wheels .

# ---- Stage 2: runtime ----
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SERVICE_NAME=plagiarism

# Runtime layout:
#   * libpq5    — asyncpg
#   * nodejs 20 — Dolos is a Node CLI (@dodona/dolos), invoked by the
#                 ``DolosProvider`` subprocess wrapper. Without it every
#                 run fails with "dolos binary missing: No such file".
#   * build-essential + python3 + git — needed only at ``npm install``
#                 time so tree-sitter native modules compile; purged
#                 right after to keep the layer small.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        ca-certificates \
        gnupg \
        build-essential \
        python3 \
        git \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
        > /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g --omit=dev @dodona/dolos \
    && npm cache clean --force \
    && apt-get purge -y build-essential gnupg git \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /root/.npm \
    && dolos --version \
    && groupadd --system --gid 10001 plaglens \
    && useradd --system --uid 10001 --gid plaglens --home /app --shell /sbin/nologin plaglens \
    && mkdir -p /app

WORKDIR /app

COPY --from=builder /wheels /wheels
RUN pip install --no-index --find-links=/wheels plaglens-plagiarism-service && \
    rm -rf /wheels

COPY services/plagiarism/alembic.ini ./
COPY services/plagiarism/alembic ./alembic
COPY services/plagiarism/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh && chown -R plaglens:plaglens /app

USER plaglens

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl --fail http://localhost:${PORT}/healthz || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
