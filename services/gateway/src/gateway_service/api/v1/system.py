"""Liveness, readiness, and Prometheus exposition."""

from __future__ import annotations

from fastapi import APIRouter, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from gateway_service.metrics import REGISTRY
from gateway_service.redis_client import get_redis

router = APIRouter()


@router.get("/healthz", tags=["system"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz", tags=["system"])
async def readyz() -> Response:
    """Readiness — pings Redis (best-effort)."""
    try:
        r = await get_redis()
        await r.ping()
        return Response(
            content='{"status":"ready"}', media_type="application/json", status_code=200
        )
    except Exception as e:
        return Response(
            content=f'{{"status":"not_ready","error":"{type(e).__name__}"}}',
            media_type="application/json",
            status_code=503,
        )


@router.get("/metrics", tags=["system"])
async def metrics() -> Response:
    data = generate_latest(REGISTRY)
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


__all__ = ["router"]
