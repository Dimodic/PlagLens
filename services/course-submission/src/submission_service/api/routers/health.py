"""Health & meta endpoints (section H)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from submission_service.api.deps import SessionDep
from submission_service.config import get_settings

router = APIRouter()


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(session: SessionDep) -> dict[str, Any]:
    try:
        await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
    status = "ok" if db_ok else "degraded"
    return {"status": status, "db": db_ok}


@router.get("/v1/version")
async def version() -> dict[str, str]:
    s = get_settings()
    return {"version": s.VERSION, "service": s.SERVICE_NAME}
