"""GET /v1/version and /api/v1/version — gateway build info.

Both paths point at the same handler. We register them as two separate
endpoints (FastAPI does NOT correctly stack `@router.get` decorators on a
single coroutine — only the innermost path is registered).
"""

from __future__ import annotations

from fastapi import APIRouter

from gateway_service.config import settings
from gateway_service.schemas.common import VersionInfo

router = APIRouter()


async def _version_payload() -> VersionInfo:
    return VersionInfo(
        service=settings.service_name,
        version=settings.version,
        commit=settings.commit,
        built_at=settings.built_at,
        environment=settings.environment,
    )


@router.get("/v1/version", response_model=VersionInfo, tags=["meta"])
async def version_legacy() -> VersionInfo:
    return await _version_payload()


@router.get("/api/v1/version", response_model=VersionInfo, tags=["meta"])
async def version() -> VersionInfo:
    return await _version_payload()


__all__ = ["router"]
