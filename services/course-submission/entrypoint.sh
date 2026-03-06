#!/usr/bin/env bash
# PlagLens — merged course+submission service entrypoint.
#   1. Wait for Postgres (DATABASE_URL) and Redis (REDIS_URL).
#   2. Run BOTH schemas' alembic migrations (course, then submission).
#   3. Hand off to uvicorn (PID 1).
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-course-submission}"
PORT="${PORT:-8000}"
PKG_NAME="course_submission_service"

echo "[entrypoint] ${SERVICE_NAME} starting..."

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

# Migrations: course schema then submission schema (both live in one DB).
echo "[entrypoint] alembic upgrade head (course schema)..."
cd /app && alembic -c course_alembic.ini upgrade head
echo "[entrypoint] alembic upgrade head (submission schema)..."
cd /app && alembic -c submission_alembic.ini upgrade head

echo "[entrypoint] starting uvicorn on 0.0.0.0:${PORT}..."
exec uvicorn "${PKG_NAME}.main:app" \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers 1 \
    --proxy-headers \
    --forwarded-allow-ips '*'
