"""Kafka consumer task: handles cross-service events.

Subscribes to:
- ``plaglens.submission.submission.v1`` — auto-run on new submission
- ``plaglens.plagiarism.run.v1`` — optional auto-run on suspicious only
- ``plaglens.course.assignment.v1`` — track default prompt version per assignment
- ``plaglens.identity.user.v1`` — purge cache for anonymized users

Idempotency: ``processed_events`` table; duplicate ``event_id`` → no-op.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..db import get_session_factory
from ..models import AIAnalysis, ProcessedEvent

logger = logging.getLogger(__name__)


SUBSCRIBED_TOPICS = [
    "plaglens.submission.submission.v1",
    "plaglens.plagiarism.run.v1",
    "plaglens.course.assignment.v1",
    "plaglens.identity.user.v1",
]


HANDLERS = {
    "submission.submission.created.v1": "handle_submission_created",
    "submission.submission.deleted.v1": "handle_submission_deleted",
    "plagiarism.run.completed.v1": "handle_plagiarism_completed",
    "course.assignment.created.v1": "handle_assignment_created",
    "identity.user.anonymized.v1": "handle_user_anonymized",
}


class AnalysisEventConsumer:
    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()
        self._consumer: Any | None = None
        self._auto_run_assignments: dict[str, dict[str, Any]] = {}

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
        event_type = (envelope.get("type") or "").removeprefix("plaglens.")
        handler_name = HANDLERS.get(event_type)
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
        return await session.get(ProcessedEvent, event_id) is not None

    @staticmethod
    async def _mark_processed(session: AsyncSession, event_id: str) -> None:
        if not event_id:
            return
        session.add(
            ProcessedEvent(event_id=event_id, consumer_group="ai-analysis-service")
        )

    # --------------------- handlers ----------------------------

    async def handle_submission_created(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data") or {}
        assignment_id = str(data.get("assignment_id") or "")
        cfg = self._auto_run_assignments.get(assignment_id)
        if not cfg or not cfg.get("ai_auto_run"):
            return
        # In production this would enqueue a background analysis task. For
        # the academic prototype we just record intent in logs - actual
        # invocation lives in the API endpoint and is shared via Idempotency-Key.
        logger.info(
            "ai.auto_run candidate submission=%s assignment=%s",
            data.get("submission_id"),
            assignment_id,
        )

    async def handle_submission_deleted(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data") or {}
        submission_id = str(data.get("submission_id") or "")
        if not submission_id:
            return
        from datetime import UTC, datetime

        await session.execute(
            update(AIAnalysis)
            .where(
                AIAnalysis.submission_id == submission_id,
                AIAnalysis.deleted_at.is_(None),
            )
            .values(deleted_at=datetime.now(UTC))
        )

    async def handle_plagiarism_completed(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data") or {}
        suspicious = bool(data.get("suspicious"))
        submission_id = str(data.get("submission_id") or "")
        assignment_id = str(data.get("assignment_id") or "")
        cfg = self._auto_run_assignments.get(assignment_id, {})
        if not cfg.get("ai_only_for_suspicious") or not suspicious:
            return
        logger.info(
            "ai.suspicious_only candidate submission=%s assignment=%s",
            submission_id,
            assignment_id,
        )

    async def handle_assignment_created(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data") or {}
        assignment_id = str(data.get("assignment_id") or "")
        if not assignment_id:
            return
        self._auto_run_assignments[assignment_id] = {
            "prompt_version": data.get("default_prompt_version"),
            "ai_auto_run": bool(data.get("ai_auto_run")),
            "ai_only_for_suspicious": bool(data.get("ai_only_for_suspicious")),
        }

    async def handle_user_anonymized(
        self, session: AsyncSession, envelope: dict[str, Any]
    ) -> None:
        data = envelope.get("data") or {}
        user_id = str(data.get("user_id") or "")
        if not user_id:
            return
        # Wipe report/raw_response for analyses created by this user (defensive).
        await session.execute(
            update(AIAnalysis)
            .where(AIAnalysis.created_by == user_id)
            .values(report=None, raw_llm_response=None, injection_suspected=False)
        )


_consumer_singleton: AnalysisEventConsumer | None = None


def get_consumer() -> AnalysisEventConsumer:
    global _consumer_singleton
    if _consumer_singleton is None:
        _consumer_singleton = AnalysisEventConsumer()
    return _consumer_singleton


def reset_consumer() -> None:
    global _consumer_singleton
    _consumer_singleton = None
