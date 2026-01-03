"""Operation status lookup (§Cross-cutting)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.deps import get_session
from ...common.problem import not_found
from ...common.rbac import Principal, get_principal
from ...models.reporting import ExportJob

router = APIRouter(tags=["operations"])


@router.get("/operations/{operation_id}")
async def get_operation(
    operation_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ExportJob).where(
        ExportJob.operation_id == operation_id, ExportJob.tenant_id == p.tenant_id
    )
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        raise not_found(f"Operation {operation_id} not found")
    svc = request.app.state.export_service
    return svc.to_operation(job)


@router.post("/operations/{operation_id}:cancel", status_code=202)
async def cancel_operation(
    operation_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(ExportJob).where(
        ExportJob.operation_id == operation_id, ExportJob.tenant_id == p.tenant_id
    )
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        raise not_found(f"Operation {operation_id} not found")
    svc = request.app.state.export_service
    job = await svc.cancel(session, p.tenant_id, job.id)
    await session.commit()
    return {"operation_id": job.operation_id, "status": "cancelled"}
