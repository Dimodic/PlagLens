#!/usr/bin/env bash
# PlagLens — merged reporting+audit+notification service entrypoint.
#   1. Wait for Postgres (DATABASE_URL) and Redis (REDIS_URL).
#   2. Run all THREE schemas' alembic migrations (reporting, audit, notification).
#   3. Hand off to uvicorn (PID 1).
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-reporting-audit-notification}"
PORT="${PORT:-8000}"
PKG_NAME="reporting_audit_notification_service"

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
            await r.aclose()
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

# Migrations: one DB, three schemas (reporting, audit, notification).
echo "[entrypoint] alembic upgrade head (reporting schema)..."
cd /app && alembic -c reporting_alembic.ini upgrade head
echo "[entrypoint] alembic upgrade head (audit schema)..."
cd /app && alembic -c audit_alembic.ini upgrade head
echo "[entrypoint] alembic upgrade head (notification schema)..."
cd /app && alembic -c notification_alembic.ini upgrade head

echo "[entrypoint] starting uvicorn on 0.0.0.0:${PORT}..."
exec uvicorn "${PKG_NAME}.main:app" \
    --host 0.0.0.0 \
    --port "${PORT}" \
    --workers 1 \
    --proxy-headers \
    --forwarded-allow-ips '*'
