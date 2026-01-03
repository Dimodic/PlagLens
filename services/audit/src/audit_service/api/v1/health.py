"""Health, readiness, version, metrics endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response
from sqlalchemy import text

from ...config import settings
from ...db import get_engine

router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/readyz")
async def readyz():
    deps: dict[str, str] = {}
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        deps["db"] = "ok"
    except Exception as exc:  # noqa: BLE001
        deps["db"] = f"error: {exc}"
    return {"status": "ok" if all(v == "ok" for v in deps.values()) else "degraded", "deps": deps}


@router.get("/api/v1/version")
async def version():
    return {
        "service": settings.service_name,
        "version": settings.version,
        "environment": settings.environment,
    }


@router.get("/metrics")
async def metrics(request: Request):
    try:
        from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

        return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
    except Exception:  # noqa: BLE001
        return Response(content="# metrics unavailable\n", media_type="text/plain")
