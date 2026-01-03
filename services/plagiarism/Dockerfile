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

# ---- Stage 2: jplag-fetcher ----
# Pulls the official JPlag fat-jar from GitHub Releases. Pinned by ARG so CI
# can override during a hot-fix. We verify the jar is non-empty and parseable
# in stage 3 ("smoke check").
FROM debian:bookworm-slim AS jplag-fetcher

ARG JPLAG_VERSION=5.1.0
ENV JPLAG_VERSION=${JPLAG_VERSION}

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt \
    && curl -fsSL \
        "https://github.com/jplag/JPlag/releases/download/v${JPLAG_VERSION}/jplag-${JPLAG_VERSION}-jar-with-dependencies.jar" \
        -o /opt/jplag.jar \
    && test -s /opt/jplag.jar

# ---- Stage 3: runtime ----
FROM python:3.12-slim-bookworm AS runtime

ARG JPLAG_VERSION=5.1.0
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    SERVICE_NAME=plagiarism \
    JPLAG_JAR_PATH=/opt/jplag.jar \
    JPLAG_VERSION=${JPLAG_VERSION}

# Install Java 21 (required by JPlag 5.1.0+) via Eclipse Temurin + libpq for asyncpg.
# JPlag 5.1.0 was compiled with class file v65 (Java 21); Debian's default-jre is Java 17.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
        curl \
        ca-certificates \
        wget \
        gnupg \
    && mkdir -p /etc/apt/keyrings \
    && wget -qO- https://packages.adoptium.net/artifactory/api/gpg/key/public | gpg --dearmor -o /etc/apt/keyrings/adoptium.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb bookworm main" > /etc/apt/sources.list.d/adoptium.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends temurin-21-jre \
    && apt-get purge -y wget gnupg \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 plaglens \
    && useradd --system --uid 10001 --gid plaglens --home /app --shell /sbin/nologin plaglens \
    && mkdir -p /opt /app

WORKDIR /app

# Copy the verified JPlag fat-jar from the fetcher stage.
COPY --from=jplag-fetcher /opt/jplag.jar /opt/jplag.jar

# Smoke check: JPlag must be invokable (parses the jar's main class). If the
# JRE/jar combination is broken, the build fails here rather than at runtime.
RUN java -jar /opt/jplag.jar --help > /dev/null 2>&1 \
    || java -jar /opt/jplag.jar -h > /dev/null 2>&1 \
    || { echo "JPlag jar smoke check failed"; java -jar /opt/jplag.jar --help; exit 1; }

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
