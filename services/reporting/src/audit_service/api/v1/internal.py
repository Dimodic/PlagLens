"""Internal write API for service-to-service direct ingest."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...deps import get_session, require_internal_service_token
from ...repositories.events import AuditEventRepository
from ...schemas.events import AuditEventCreate, IngestResponse

router = APIRouter(prefix="/audit", tags=["audit-internal"])


@router.post(
    "/events",
    response_model=IngestResponse,
    status_code=201,
    summary="Service-to-service direct write",
)
async def ingest_event(
    request: Request,
    body: AuditEventCreate,
    service_name: str = Depends(require_internal_service_token),
    session: AsyncSession = Depends(get_session),
):
    repo = AuditEventRepository(session)
    if body.event_id and await repo.is_duplicate_event_id(
        body.event_id, consumer_group="internal"
    ):
        # Find by event_id (best-effort) or simply ack as duplicate.
        return IngestResponse(id=body.event_id, deduplicated=True)

    if not body.source_service:
        body.source_service = service_name
    ev = await repo.insert_event(body)
    if body.event_id:
        await repo.mark_processed(body.event_id, consumer_group="internal")
    return IngestResponse(id=ev.id, deduplicated=False)
