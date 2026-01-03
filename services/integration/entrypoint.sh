#!/usr/bin/env bash
# PlagLens — integration service entrypoint.
# Bootstraps the container before handing off to uvicorn:
#   1. Wait for Postgres to be reachable (DATABASE_URL).
#   2. Wait for Redis to be reachable (REDIS_URL).
#   3. Run alembic migrations (idempotent — alembic skips applied revisions).
#   4. Hand off to uvicorn (PID 1).
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-integration}"
PORT="${PORT:-8000}"
PKG_NAME="integration_service"

echo "[entrypoint] ${SERVICE_NAME} starting..."

# --------------------------------------------------------------------- #
# 1. Wait for Postgres reachable
# --------------------------------------------------------------------- #
echo "[entrypoint] waiting for Postgres..."
python - <<'PY'
import asyncio, os, sys
import asyncpg

async def wait():
    dsn = os.environ["DATABASE_URL"].replace("+asyncpg", "")
    for i in range(60):
        try:
            conn = await asyncpg.connect(dsn)
            await conn.close()
            return
        except Exception as e:
            print(f"  postgres not ready ({e!r}), retry {i+1}/60...", file=sys.stderr)
            await asyncio.sleep(2)
    raise SystemExit("postgres did not become ready in 120s")

asyncio.run(wait())
PY

# --------------------------------------------------------------------- #
# 2. Wait for Redis reachable
# --------------------------------------------------------------------- #
if [ -n "${REDIS_URL:-}" ]; then
    echo "[entrypoint] waiting for Redis..."
    python - <<'PY'
import asyncio, os, sys
import redis.asyncio as redis_lib

async def wait():
    for i in range(30):
        try:
            r = redis_lib.from_url(os.environ["REDIS_URL"])
            await r.ping()
            await r.close()
            return
        except Exception as e:
            print(f"  redis not ready ({e!r}), retry {i+1}/30...", file=sys.stderr)
            await asyncio.sleep(2)
    raise SystemExit("redis did not become ready in 60s")

asyncio.run(wait())
PY
else
    echo "[entrypoint] REDIS_URL not set — skipping Redis wait."
fi

# --------------------------------------------------------------------- #
# 3. Run alembic migrations
# --------------------------------------------------------------------- #
echo "[entrypoint] running alembic upgrade head..."
cd /app && alembic upgrade head

# --------------------------------------------------------------------- #
# 4. Exec uvicorn (replaces shell as PID 1)
# --------------------------------------------------------------------- #
echo "[entrypoint] starting uvicorn on 0.0.0.0:${PORT}..."
exec uvicorn "${PKG_NAME}.main:app" \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers 1 \
    --proxy-headers \
    --forwarded-allow-ips '*'
