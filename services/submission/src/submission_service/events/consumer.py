"""Kafka consumer task: handles cross-service events."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_session_factory
from ..models import ProcessedEvent, Submission

logger = logging.getLogger(__name__)


SUBSCRIBED_TOPICS = [
    "plaglens.course.assignment.v1",
    "plaglens.identity.user.v1",
    "plaglens.plagiarism.run.v1",
    "plaglens.ai.analysis.v1",
]


HANDLERS = {
    "course.assignment.deleted.v1": "handle_assignment_deleted",
    "identity.user.anonymized.v1": "handle_user_anonymized",
    "identity.user.deleted.v1": "handle_user_deleted",
    "plagiarism.run.completed.v1": "handle_plagiarism_completed",
    "ai.analysis.completed.v1": "handle_ai_completed",
}


class SubmissionEventConsumer:
    """Background coroutine that consumes upstream events.

    Idempotency: every event_id is recorded in ``processed_events`` and
    duplicate ids become no-ops. When ``KAFKA_DISABLED`` is set, the consumer
    sleeps without ever connecting (used by tests; ``handle_event`` can still
    be invoked directly).
    """

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._consumer: Any | None = None

    async def start(self) -> None:
        settings = get_settings()
        if settings.KAFKA_DISABLED:
            self._task = asyncio.create_task(self._idle_loop())
            return
        try:
            from aiokafka import AIOKafkaConsumer

            self._consumer = AIOKafkaConsumer(
                *SUBSCRIBED_TOPICS,
                bootstrap_servers=settings.KAFKA_BROKERS,
                group_id=settings.KAFKA_CONSUMER_GROUP,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                enable_auto_commit=True,
            )
            await self._consumer.start()
            self._task = asyncio.create_task(self._loop())
        except Exception:
            logger.exception("Kafka consumer start failed; running idle loop")
            self._task = asyncio.create_task(self._idle_loop())

    async def stop(self) -> None:
        self._stop.set()
        if self._consumer is not None:
            try:
                await self._consumer.stop()
            except Exception:
                logger.exception("Kafka consumer stop failed")
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _idle_loop(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=5)
            except TimeoutError:
                continue

    async def _loop(self) -> None:
        assert self._consumer is not None
        async for msg in self._consumer:
            try:
                await self.handle_event(msg.value)
            except Exception:
                logger.exception("Failed processing event from %s", msg.topic)

    async def handle_event(self, envelope: dict[str, Any]) -> None:
        event_id = envelope.get("id") or ""
        event_type = envelope.get("type", "")
        # strip prefix like "plaglens." to match HANDLERS keys
        normalized = event_type.removeprefix("plaglens.")
        handler_name = HANDLERS.get(normalized)
        if handler_name is None:
            return

        factory = get_session_factory()
        async with factory() as session:
            if await self._already_processed(session, event_id):
                return
            await getattr(self, handler_name)(session, envelope)
            await self._mark_processed(session, event_id)
            await session.commit()

    @staticmethod
    async def _already_processed(session: AsyncSession, event_id: str) -> bool:
        if not event_id:
            return False
        row = await session.get(ProcessedEvent, event_id)
        return row is not None

    @staticmethod
    async def _mark_processed(session: AsyncSession, event_id: str) -> None:
        if not event_id:
            return
        session.add(
            ProcessedEvent(event_id=event_id, consumer_group="submission-service")
        )

    # ---------- handlers (TODO: complete business rules) ----------

    async def handle_assignment_deleted(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data", {})
        assignment_id = str(data.get("assignment_id", ""))
        if not assignment_id:
            return
        # TODO: cascade soft-delete + emit submission.submission.deleted events
        await session.execute(
            update(Submission)
            .where(Submission.assignment_id == assignment_id, Submission.deleted_at.is_(None))
            .values(deleted_at=_now())
        )

    async def handle_user_anonymized(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data", {})
        user_id = str(data.get("user_id", ""))
        anon_id = str(data.get("anon_id") or f"anon_{user_id}")
        if not user_id:
            return
        await session.execute(
            update(Submission)
            .where(Submission.author_id == user_id)
            .values(author_id=None, anon_id=anon_id)
        )

    async def handle_user_deleted(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data", {})
        user_id = str(data.get("user_id", ""))
        if not user_id:
            return
        # TODO: respect tenant retention policy.
        await session.execute(
            update(Submission)
            .where(Submission.author_id == user_id, Submission.deleted_at.is_(None))
            .values(deleted_at=_now())
        )

    async def handle_plagiarism_completed(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data", {})
        submission_id = str(data.get("submission_id", ""))
        suspicious = bool(data.get("suspicious", False))
        if not submission_id:
            return
        sub = await session.get(Submission, submission_id)
        if sub is None:
            return
        flags = dict(sub.flags or {})
        if suspicious:
            flags["suspicious"] = True
        else:
            flags.pop("suspicious", None)
        sub.flags = flags

    async def handle_ai_completed(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data", {})
        submission_id = str(data.get("submission_id", ""))
        risk = data.get("max_risk_severity", "")
        if not submission_id:
            return
        sub = await session.get(Submission, submission_id)
        if sub is None:
            return
        flags = dict(sub.flags or {})
        if risk in {"medium", "high", "critical"}:
            flags["llm_attention"] = True
        sub.flags = flags


def _now():
    from datetime import UTC, datetime

    return datetime.now(UTC)


_consumer_singleton: SubmissionEventConsumer | None = None


def get_consumer() -> SubmissionEventConsumer:
    global _consumer_singleton
    if _consumer_singleton is None:
        _consumer_singleton = SubmissionEventConsumer()
    return _consumer_singleton


def reset_consumer() -> None:
    global _consumer_singleton
    _consumer_singleton = None
