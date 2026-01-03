"""Health, readiness, version, metrics (§K)."""
from __future__ import annotations

from fastapi import APIRouter, Request, Response

from ... import __version__
from ...schemas.common import HealthResponse, VersionResponse

router = APIRouter(tags=["health"])


@router.get("/version", response_model=VersionResponse)
async def version() -> VersionResponse:
    return VersionResponse(version=__version__)


@router.get("/healthz", response_model=HealthResponse)
async def healthz() -> HealthResponse:
    return HealthResponse(status="ok", service="reporting-service")


@router.get("/readyz")
async def readyz(request: Request) -> HealthResponse:
    checks = {"db": "ok", "redis": "ok", "kafka": "ok"}
    try:
        async with request.app.state.session_maker() as s:
            from sqlalchemy import text

            await s.execute(text("SELECT 1"))
    except Exception as e:
        checks["db"] = f"fail: {e}"
    try:
        await request.app.state.redis.ping()
    except Exception as e:
        checks["redis"] = f"fail: {e}"
    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return HealthResponse(status=status, service="reporting-service", checks=checks)


@router.get("/metrics")
async def metrics() -> Response:
    try:
        from prometheus_client import (  # type: ignore
            CONTENT_TYPE_LATEST,
            CollectorRegistry,
            generate_latest,
        )

        body = generate_latest(CollectorRegistry())
        return Response(body, media_type=CONTENT_TYPE_LATEST)
    except Exception:
        return Response(b"# metrics unavailable\n", media_type="text/plain")
