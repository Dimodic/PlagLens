"""Health, readiness, version, metrics."""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Response
from sqlalchemy import text

from notification_service import __version__
from notification_service.config import get_settings
from notification_service.db import get_session_factory
from notification_service.metrics import metrics_response_body
from notification_service.redis_bus import get_redis

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, object]:
    deps = {"db": False, "redis": False}
    try:
        factory = get_session_factory()
        async with factory() as session:
            await session.execute(text("SELECT 1"))
        deps["db"] = True
    except Exception:
        deps["db"] = False
    try:
        client = get_redis()
        if hasattr(client, "ping"):
            res = client.ping()
            if hasattr(res, "__await__"):
                await res
        deps["redis"] = True
    except Exception:
        deps["redis"] = False
    return {"ready": all(deps.values()), "deps": deps}


@router.get("/v1/version")
async def version() -> dict[str, object]:
    return {
        "version": __version__,
        "service": get_settings().SERVICE_NAME,
        "ts": datetime.now(UTC).isoformat(),
    }


@router.get("/metrics")
async def metrics() -> Response:
    body, ct = metrics_response_body()
    return Response(content=body, media_type=ct)
