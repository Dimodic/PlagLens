"""Read-models admin endpoints (§I)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.deps import get_session
from ...common.rbac import Principal, require_global
from ...common.time import iso
from ...repositories.read_models import ReadModelRepo

router = APIRouter(prefix="/admin/reporting/read-models", tags=["read-models"])


@router.post(":rebuild", status_code=202)
async def rebuild_all(
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    repo = ReadModelRepo(session)
    deleted = await repo.reset_all(tenant_id=p.tenant_id)
    await session.commit()
    return {"status": "rebuilt", "deleted_rows": deleted, "tenant_id": p.tenant_id}


@router.post("/{name}:rebuild", status_code=202)
async def rebuild_one(
    name: str,
    request: Request,
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    repo = ReadModelRepo(session)
    deleted = await repo.reset_one(name, tenant_id=p.tenant_id)
    await session.commit()
    return {"status": "rebuilt", "name": name, "deleted_rows": deleted}


@router.get("/health")
async def health(
    p: Principal = Depends(require_global("admin")),
    session: AsyncSession = Depends(get_session),
):
    repo = ReadModelRepo(session)
    healths = await repo.health()
    return {
        "data": [
            {
                "name": h.name,
                "lag_seconds": h.lag_seconds,
                "last_event_at": iso(h.last_event_at) if h.last_event_at else None,
                "last_processed_at": iso(h.last_processed_at),
            }
            for h in healths
        ]
    }
