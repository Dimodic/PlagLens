"""Health / metrics / version."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Response

from integration_service import __version__
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


@router.get("/readyz", include_in_schema=False)
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


@router.get("/metrics", include_in_schema=False)
async def metrics() -> Response:
    if not _PROM or generate_latest is None:
        return Response("", media_type="text/plain")
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/version")
async def version() -> dict[str, Any]:
    s = get_settings()
    return {"version": __version__, "service": s.service_name, "environment": s.environment}
