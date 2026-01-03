"""Kafka consumer handlers for course/identity events."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Mapping

import structlog
from sqlalchemy import select, update

from integration_service.common.db import get_sessionmaker
from integration_service.common.kafka_bus import KafkaBus
from integration_service.models import IntegrationConfig, ProcessedEvent

logger = structlog.get_logger(__name__)


async def _is_duplicate(event_id: str, group: str) -> bool:
    sm = get_sessionmaker()
    async with sm() as session:
        existing = (
            await session.execute(
                select(ProcessedEvent).where(ProcessedEvent.event_id == event_id)
            )
        ).scalar_one_or_none()
        if existing is not None:
            return True
        session.add(ProcessedEvent(event_id=event_id, consumer_group=group))
        try:
            await session.commit()
        except Exception:
            await session.rollback()
            return True
    return False


async def handle_assignment_created(event: Mapping[str, Any]) -> None:
    event_id = event.get("id") or ""
    if not event_id:
        return
    if await _is_duplicate(event_id, "integration"):
        return
    data = event.get("data", {}) or {}
    bindings = data.get("external_bindings") or []
    course_id = data.get("course_id")
    if not bindings or not course_id:
        return
    sm = get_sessionmaker()
    async with sm() as session:
        rows = (
            await session.execute(
                select(IntegrationConfig).where(
                    IntegrationConfig.course_id == course_id,
                    IntegrationConfig.deleted_at.is_(None),
                    IntegrationConfig.status == "active",
                )
            )
        ).scalars().all()
        for cfg in rows:
            stng = dict(cfg.settings or {})
            stng.setdefault("registered_assignments", []).append(data.get("assignment_id"))
            cfg.settings = stng
        await session.commit()


async def handle_course_deleted(event: Mapping[str, Any]) -> None:
    event_id = event.get("id") or ""
    if not event_id or await _is_duplicate(event_id, "integration"):
        return
    data = event.get("data", {}) or {}
    course_id = data.get("course_id")
    if not course_id:
        return
    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(
            update(IntegrationConfig)
            .where(IntegrationConfig.course_id == course_id)
            .values(status="disabled", updated_at=datetime.now(UTC))
        )
        await session.commit()


async def handle_tenant_deleted(event: Mapping[str, Any]) -> None:
    event_id = event.get("id") or ""
    if not event_id or await _is_duplicate(event_id, "integration"):
        return
    data = event.get("data", {}) or {}
    tenant_id = data.get("tenant_id") or event.get("tenant_id")
    if not tenant_id:
        return
    sm = get_sessionmaker()
    async with sm() as session:
        await session.execute(
            update(IntegrationConfig)
            .where(IntegrationConfig.tenant_id == tenant_id)
            .values(status="disabled", updated_at=datetime.now(UTC))
        )
        await session.commit()


def register(bus: KafkaBus) -> None:
    bus.on("course.assignment.created.v1", handle_assignment_created)
    bus.on("course.course.deleted.v1", handle_course_deleted)
    bus.on("identity.tenant.deleted.v1", handle_tenant_deleted)
