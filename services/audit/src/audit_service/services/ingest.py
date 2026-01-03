"""CloudEvents-from-Kafka → AuditEvent translation."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..common.logging import get_logger
from ..models import AuditEvent
from ..repositories.events import AuditEventRepository
from ..schemas.events import ActorIn, AuditEventCreate, ResourceIn

log = get_logger("audit.ingest")

# Actions we consider long-retention (login, access denied, data export).
LONG_RETENTION_ACTIONS: set[str] = {
    "auth.login_failed",
    "auth.login_success",
    "rbac.access_denied",
    "data_export.created",
    "identity.user.password_changed",
    "identity.user.role_assigned",
    "identity.user.deleted",
    "identity.user.anonymized",
    "tenant.deleted",
}


def classify_retention(action: str) -> str:
    if action in LONG_RETENTION_ACTIONS:
        return "long"
    return "default"


def cloudevent_to_audit_create(event: dict[str, Any]) -> AuditEventCreate:
    """Translate a CloudEvents-shaped Kafka record into AuditEventCreate."""
    data = event.get("data") or {}
    actor_raw = event.get("actor") or {}
    if not isinstance(actor_raw, dict):
        actor_raw = {}

    # `type` looks like ``plaglens.<service>.<domain>.<action>.v1`` — extract action.
    raw_type = event.get("type", "")
    action = ".".join(raw_type.split(".")[2:-1]) if raw_type else "unknown"

    subject = event.get("subject") or ""
    resource_type = subject.split("/", 1)[0] if "/" in subject else None
    resource_id = subject.split("/", 1)[1] if "/" in subject else data.get(
        "resource_id"
    ) or data.get("submission_id") or data.get("user_id") or data.get("course_id")

    occurred = event.get("time")
    occurred_dt: datetime | None = None
    if occurred:
        try:
            occurred_dt = datetime.fromisoformat(occurred.replace("Z", "+00:00"))
        except ValueError:
            occurred_dt = None

    return AuditEventCreate(
        event_id=event.get("id"),
        tenant_id=event.get("tenant_id") or data.get("tenant_id"),
        occurred_at=occurred_dt or datetime.now(UTC),
        actor=ActorIn(
            type=actor_raw.get("type", "system"),
            id=actor_raw.get("id"),
            role=actor_raw.get("role"),
        ),
        action=action or raw_type or "unknown",
        result=str(data.get("result", "success")),
        resource=ResourceIn(
            type=resource_type or data.get("resource_type"),
            id=str(resource_id) if resource_id else None,
        ),
        source_service=raw_type.split(".")[1] if raw_type.count(".") >= 1 else None,
        request_id=event.get("trace_id") or data.get("request_id"),
        ip=data.get("ip"),
        user_agent=data.get("user_agent"),
        before=data.get("before"),
        after=data.get("after"),
        metadata=data,
        retention_class=classify_retention(action),
    )


async def ingest_kafka_event(
    session: AsyncSession,
    event: dict[str, Any],
    *,
    consumer_group: str,
) -> AuditEvent | None:
    """Idempotent persist of a Kafka event. Returns None on duplicate."""
    repo = AuditEventRepository(session)
    event_id = event.get("id")
    if event_id and await repo.is_duplicate_event_id(
        event_id, consumer_group=consumer_group
    ):
        log.info("audit.ingest.duplicate", event_id=event_id)
        return None

    payload = cloudevent_to_audit_create(event)
    ev = await repo.insert_event(payload)
    if event_id:
        await repo.mark_processed(event_id, consumer_group=consumer_group)
    return ev
