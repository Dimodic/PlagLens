"""Health, readiness, version, metrics endpoints (spec §K)."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import __version__
from ..config import Settings, get_settings
from ..deps import get_session

router = APIRouter(tags=["health"])


@router.get("/healthz", include_in_schema=False)
async def healthz() -> dict[str, str]:
    """Liveness — returns 200 when the process is up."""
    return {"status": "ok"}


@router.get("/readyz", include_in_schema=False)
async def readyz(
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    """Readiness — pings the database. Redis/Kafka are best-effort and not blocking."""
    await session.execute(text("SELECT 1"))
    return {"status": "ready"}


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    """Prometheus exposition."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/api/v1/version", tags=["meta"])
async def version(settings: Settings = Depends(get_settings)) -> dict[str, str]:
    return {
        "service": settings.service_name,
        "version": __version__,
        "commit": os.environ.get("GIT_COMMIT", "unknown"),
        "environment": settings.environment,
    }
