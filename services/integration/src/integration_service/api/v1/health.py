"""Health / metrics / version."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Response
from sqlalchemy import text

from integration_service import __version__
from integration_service.common.db import get_sessionmaker
from integration_service.common.redis_client import get_redis
from integration_service.config import get_settings

try:
    from prometheus_client import CONTENT_TYPE_LATEST, generate_latest  # type: ignore

    _PROM = True
except Exception:  # pragma: no cover
    CONTENT_TYPE_LATEST = "text/plain"  # type: ignore
    generate_latest = None  # type: ignore
    _PROM = False


router = APIRouter(tags=["meta"])


@router.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


_READY_CHECK_TIMEOUT = 2.0  # seconds — keep readiness fast + resilient


async def _check_db() -> str:
    try:
        sm = get_sessionmaker()
        async with sm() as session:
            await asyncio.wait_for(
                session.execute(text("SELECT 1")), timeout=_READY_CHECK_TIMEOUT
            )
        return "ok"
    except Exception as exc:  # never raise — readiness must always answer
        return f"fail: {type(exc).__name__}"


async def _check_redis() -> str:
    try:
        redis = get_redis()
        await asyncio.wait_for(redis.ping(), timeout=_READY_CHECK_TIMEOUT)
        return "ok"
    except Exception as exc:  # never raise — readiness must always answer
        return f"fail: {type(exc).__name__}"


@router.get("/readyz", include_in_schema=False)
async def readyz(response: Response) -> dict[str, Any]:
    db_result, redis_result = await asyncio.gather(_check_db(), _check_redis())
    checks = {"db": db_result, "redis": redis_result}
    ok = all(v == "ok" for v in checks.values())
    if not ok:
        response.status_code = 503
    return {"status": "ok" if ok else "degraded", "checks": checks}


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    if not _PROM or generate_latest is None:
        return Response("", media_type="text/plain")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/version")
async def version() -> dict[str, Any]:
    s = get_settings()
    return {"version": __version__, "service": s.service_name, "environment": s.environment}
