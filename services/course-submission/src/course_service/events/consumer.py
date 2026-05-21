"""Kafka consumer for identity / tenant lifecycle events.

Subscriptions (per ``05-COURSE.md`` §"События, на которые подписан"):

- ``identity.user.deleted.v1``      → soft-remove from CourseMember
- ``identity.user.anonymized.v1``   → no-op except dedup logging (no PII stored locally)
- ``identity.tenant.deleted.v1``    → archive all courses for the tenant
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from ..config import Settings
from ..models import Course, CourseMember, CourseOwner, ProcessedEvent

logger = structlog.get_logger(__name__)


async def _already_processed(session, event_id: str, group: str) -> bool:
    stmt = select(ProcessedEvent).where(ProcessedEvent.event_id == event_id)
    existing = (await session.execute(stmt)).scalar_one_or_none()
    if existing is not None:
        return True
    session.add(ProcessedEvent(event_id=event_id, consumer_group=group))
    return False


async def _handle_user_deleted(session, data: dict[str, Any]) -> None:
    user_id = data.get("user_id")
    if not user_id:
        return
    # Mark all CourseMember rows as removed.
    stmt = select(CourseMember).where(
        CourseMember.user_id == user_id, CourseMember.removed_at.is_(None)
    )
    rows = list((await session.execute(stmt)).scalars().all())
    now = datetime.now(tz=UTC)
    for m in rows:
        m.removed_at = now
    # If the user was a primary owner, leave the row in place (admin must reassign).
    owner_stmt = select(CourseOwner).where(CourseOwner.user_id == user_id)
    owners = list((await session.execute(owner_stmt)).scalars().all())
    for owner in owners:
        if owner.role == "co_owner":
            await session.delete(owner)
    logger.info(
        "consumer.user_deleted_processed",
        user_id=user_id,
        members_removed=len(rows),
        co_owners_removed=sum(1 for o in owners if o.role == "co_owner"),
    )


async def _handle_user_anonymized(session, data: dict[str, Any]) -> None:
    # Course service does not store PII; this is a marker for audit-only.
    logger.info("consumer.user_anonymized_processed", user_id=data.get("user_id"))


async def _handle_tenant_deleted(session, data: dict[str, Any]) -> None:
    tenant_id = data.get("tenant_id")
    if not tenant_id:
        return
    stmt = select(Course).where(Course.tenant_id == tenant_id, Course.deleted_at.is_(None))
    rows = list((await session.execute(stmt)).scalars().all())
    now = datetime.now(tz=UTC)
    for c in rows:
        c.deleted_at = now
        c.status = "archived"
    logger.info(
        "consumer.tenant_deleted_processed", tenant_id=tenant_id, courses_archived=len(rows)
    )


_HANDLERS = {
    "identity.user.deleted.v1": _handle_user_deleted,
    "plaglens.identity.user.deleted.v1": _handle_user_deleted,
    "identity.user.anonymized.v1": _handle_user_anonymized,
    "plaglens.identity.user.anonymized.v1": _handle_user_anonymized,
    "identity.tenant.deleted.v1": _handle_tenant_deleted,
    "plaglens.identity.tenant.deleted.v1": _handle_tenant_deleted,
}


async def process_envelope(
    envelope: dict[str, Any],
    session_factory: async_sessionmaker,
    *,
    consumer_group: str,
) -> None:
    """Apply one envelope idempotently."""
    event_type = envelope.get("type")
    event_id = envelope.get("id")
    data = envelope.get("data") or {}
    if not event_type or not event_id:
        logger.warning("consumer.invalid_envelope", envelope=envelope)
        return
    handler = _HANDLERS.get(event_type)
    if handler is None:
        return
    async with session_factory() as session:
        if await _already_processed(session, event_id, consumer_group):
            return
        try:
            await handler(session, data)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


class IdentityEventsConsumer:
    """Background task that polls Kafka and dispatches envelopes.

    If aiokafka is unavailable or ``kafka_enabled=False``, ``run`` exits immediately.
    """

    def __init__(
        self,
        settings: Settings,
        session_factory: async_sessionmaker,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self._task: asyncio.Task | None = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        if not self.settings.kafka_enabled:
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            try:
                await asyncio.wait_for(self._task, timeout=5)
            except (TimeoutError, asyncio.CancelledError):
                self._task.cancel()

    async def _run(self) -> None:
        try:
            from aiokafka import AIOKafkaConsumer  # type: ignore[import-untyped]
        except ImportError:
            logger.warning("consumer.aiokafka_missing")
            return
        consumer = AIOKafkaConsumer(
            *self.settings.kafka_subscribed_topics,
            bootstrap_servers=self.settings.kafka_brokers,
            group_id=self.settings.kafka_consumer_group,
            enable_auto_commit=True,
        )
        try:
            await consumer.start()
        except Exception as exc:
            logger.error("consumer.start_failed", error=str(exc))
            return
        try:
            while not self._stop_event.is_set():
                try:
                    msg = await asyncio.wait_for(consumer.getone(), timeout=1.0)
                except TimeoutError:
                    continue
                try:
                    envelope = json.loads(msg.value.decode("utf-8"))
                except json.JSONDecodeError:
                    logger.warning("consumer.bad_json", topic=msg.topic)
                    continue
                try:
                    await process_envelope(
                        envelope,
                        self.session_factory,
                        consumer_group=self.settings.kafka_consumer_group,
                    )
                except Exception as exc:
                    logger.error("consumer.handler_failed", error=str(exc))
        finally:
            await consumer.stop()
