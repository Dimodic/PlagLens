"""Version endpoint (per cross-cutting §11)."""
from __future__ import annotations

import os

from fastapi import APIRouter

from ...config import settings

router = APIRouter(tags=["health"])


@router.get("/version", summary="Service version metadata")
async def version() -> dict[str, str]:
    return {
        "service": settings.service_name,
        "version": os.getenv("SERVICE_VERSION", "0.1.0"),
        "commit": os.getenv("GIT_COMMIT", "unknown"),
        "built_at": os.getenv("BUILD_TIME", ""),
    }
