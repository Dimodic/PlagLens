"""Health & version endpoints (§I)."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text
from starlette.responses import JSONResponse, Response

from ... import __version__
from ...common.redis_client import get_client
from ...db import get_session_factory

router = APIRouter()

_DB_TIMEOUT_S = 2.0
_REDIS_TIMEOUT_S = 1.0


@router.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


async def _check_db() -> str:
    """Open a session from the factory and run ``SELECT 1``. Never raises."""
    try:
        async def _probe() -> None:
            factory = get_session_factory()
            async with factory() as session:
                await session.execute(text("SELECT 1"))

        await asyncio.wait_for(_probe(), timeout=_DB_TIMEOUT_S)
        return "ok"
    except Exception as exc:  # noqa: BLE001 — readiness must never raise
        return f"fail: {type(exc).__name__}"


async def _check_redis() -> str:
    """Ping the shared Redis client. Never raises."""
    try:
        client = get_client()
        if client is None:
            raise RuntimeError("RedisUnavailable")
        await asyncio.wait_for(client.ping(), timeout=_REDIS_TIMEOUT_S)
        return "ok"
    except Exception as exc:  # noqa: BLE001 — readiness must never raise
        return f"fail: {type(exc).__name__}"


@router.get("/readyz", tags=["health"])
async def readyz() -> Response:
    db_result, redis_result = await asyncio.gather(_check_db(), _check_redis())
    checks = {"db": db_result, "redis": redis_result}
    healthy = all(v == "ok" for v in checks.values())
    body: dict[str, Any] = {
        "status": "ok" if healthy else "degraded",
        "checks": checks,
    }
    return JSONResponse(content=body, status_code=200 if healthy else 503)


@router.get("/metrics", tags=["health"])
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/api/v1/version", tags=["health"])
async def version() -> dict[str, str]:
    return {"version": __version__, "commit": "dev", "built_at": "2026-05-01T00:00:00Z"}
