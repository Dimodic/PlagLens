"""Read repository for AuditEvent + append-only writes."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.ids import new_ulid
from ..common.pagination import decode_cursor, encode_cursor
from ..models import AuditEvent, ProcessedEvent
from ..schemas.events import AuditEventCreate


class AuditEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ---- write -------------------------------------------------------- #
    async def insert_event(
        self,
        payload: AuditEventCreate,
        *,
        recorded_at: datetime | None = None,
    ) -> AuditEvent:
        actor = payload.actor
        resource = payload.resource
        from datetime import datetime as _dt

        ev = AuditEvent(
            id=new_ulid(),
            event_id=payload.event_id,
            tenant_id=payload.tenant_id,
            occurred_at=payload.occurred_at or _dt.now(UTC),
            recorded_at=recorded_at or _dt.now(UTC),
            actor_type=actor.type or "user",
            actor_id=actor.id,
            actor_role=actor.role,
            actor=actor.model_dump(),
            action=payload.action,
            result=payload.result or "success",
            resource_type=resource.type,
            resource_id=resource.id,
            resource=resource.model_dump(),
            source_service=payload.source_service,
            request_id=payload.request_id,
            ip=payload.ip,
            user_agent=payload.user_agent,
            before=payload.before,
            after=payload.after,
            metadata_=payload.metadata or {},
            retention_class=payload.retention_class or "default",
        )
        self.session.add(ev)
        await self.session.flush()
        return ev

    async def is_duplicate_event_id(
        self, event_id: str, *, consumer_group: str
    ) -> bool:
        if not event_id:
            return False
        result = await self.session.execute(
            select(ProcessedEvent).where(ProcessedEvent.event_id == event_id)
        )
        return result.scalar_one_or_none() is not None

    async def mark_processed(self, event_id: str, *, consumer_group: str) -> None:
        if not event_id:
            return
        # Idempotent insert; ignore conflict if it already exists.
        existing = await self.session.execute(
            select(ProcessedEvent).where(ProcessedEvent.event_id == event_id)
        )
        if existing.scalar_one_or_none() is not None:
            return
        self.session.add(
            ProcessedEvent(event_id=event_id, consumer_group=consumer_group)
        )
        await self.session.flush()

    # ---- read --------------------------------------------------------- #
    async def get_by_id(self, event_id: str) -> AuditEvent | None:
        res = await self.session.execute(
            select(AuditEvent).where(AuditEvent.id == event_id)
        )
        return res.scalar_one_or_none()

    def _apply_filters(  # noqa: PLR0913
        self,
        stmt,
        *,
        tenant_id: str | None,
        action: str | None = None,
        actor_id: str | None = None,
        actor_type: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        result: str | None = None,
        source_service: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
    ):
        if tenant_id is not None:
            stmt = stmt.where(AuditEvent.tenant_id == tenant_id)
        if action:
            stmt = stmt.where(AuditEvent.action == action)
        if actor_id:
            stmt = stmt.where(AuditEvent.actor_id == actor_id)
        if actor_type:
            stmt = stmt.where(AuditEvent.actor_type == actor_type)
        if resource_type:
            stmt = stmt.where(AuditEvent.resource_type == resource_type)
        if resource_id:
            stmt = stmt.where(AuditEvent.resource_id == resource_id)
        if result:
            stmt = stmt.where(AuditEvent.result == result)
        if source_service:
            stmt = stmt.where(AuditEvent.source_service == source_service)
        if since:
            stmt = stmt.where(AuditEvent.recorded_at >= since)
        if until:
            stmt = stmt.where(AuditEvent.recorded_at <= until)
        return stmt

    async def list_events(  # noqa: PLR0913
        self,
        *,
        tenant_id: str | None,
        cursor: str | None = None,
        limit: int = 50,
        q: str | None = None,
        **filters: Any,
    ) -> tuple[list[AuditEvent], str | None]:
        stmt = select(AuditEvent)
        stmt = self._apply_filters(stmt, tenant_id=tenant_id, **filters)

        if q:
            like = f"%{q.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(AuditEvent.action).like(like),
                    func.lower(AuditEvent.actor_id).like(like),
                    func.lower(AuditEvent.resource_id).like(like),
                )
            )

        decoded = decode_cursor(cursor)
        if decoded:
            after_recorded = datetime.fromisoformat(decoded["recorded_at"])
            after_id = decoded["id"]
            stmt = stmt.where(
                or_(
                    AuditEvent.recorded_at < after_recorded,
                    and_(
                        AuditEvent.recorded_at == after_recorded,
                        AuditEvent.id < after_id,
                    ),
                )
            )

        stmt = stmt.order_by(desc(AuditEvent.recorded_at), desc(AuditEvent.id)).limit(
            limit + 1
        )
        rows = (await self.session.execute(stmt)).scalars().all()

        has_more = len(rows) > limit
        rows = rows[:limit]
        next_cursor: str | None = None
        if has_more and rows:
            last = rows[-1]
            next_cursor = encode_cursor(
                {"recorded_at": last.recorded_at.isoformat(), "id": last.id}
            )
        return list(rows), next_cursor

    async def aggregate(
        self,
        *,
        tenant_id: str | None,
        by: str,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        col = {
            "action": AuditEvent.action,
            "result": AuditEvent.result,
            "actor_id": AuditEvent.actor_id,
            "resource_type": AuditEvent.resource_type,
            "source_service": AuditEvent.source_service,
        }.get(by, AuditEvent.action)
        stmt = select(col, func.count().label("count"))
        stmt = self._apply_filters(stmt, tenant_id=tenant_id, **(filters or {}))
        stmt = stmt.group_by(col).order_by(desc("count")).limit(50)
        rows = (await self.session.execute(stmt)).all()
        return [{"key": r[0], "count": int(r[1])} for r in rows]

    async def stats(self, *, tenant_id: str | None) -> dict[str, Any]:
        total_stmt = select(func.count()).select_from(AuditEvent)
        total_stmt = self._apply_filters(total_stmt, tenant_id=tenant_id)
        total = (await self.session.execute(total_stmt)).scalar_one() or 0

        by_action = await self.aggregate(tenant_id=tenant_id, by="action")
        by_result = await self.aggregate(tenant_id=tenant_id, by="result")

        failure = sum(b["count"] for b in by_result if b["key"] == "failure")
        error_rate = (failure / total) if total else 0.0
        return {
            "total_events": int(total),
            "by_action": by_action,
            "by_result": by_result,
            "error_rate": round(error_rate, 4),
            "storage_bytes_estimate": int(total) * 1024,
        }
