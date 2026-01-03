"""Health & version endpoints (§I)."""
from __future__ import annotations

from fastapi import APIRouter
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from starlette.responses import Response

from ... import __version__

router = APIRouter()


@router.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz", tags=["health"])
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


@router.get("/metrics", tags=["health"])
async def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@router.get("/api/v1/version", tags=["health"])
async def version() -> dict[str, str]:
    return {"version": __version__, "commit": "dev", "built_at": "2026-05-01T00:00:00Z"}
