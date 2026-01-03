"""Health, readiness, version, metrics endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from ..config import get_settings

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, Any]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz() -> dict[str, Any]:
    return {"status": "ready"}


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics() -> Response:
    payload = generate_latest()
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)


@router.get("/api/v1/version")
async def version() -> dict[str, Any]:
    s = get_settings()
    return {"version": s.VERSION, "service": s.SERVICE_NAME}
