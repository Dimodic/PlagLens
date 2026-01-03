"""Kafka consumer that reacts to upstream events.

Subscribed topics:
- ``submission.submission.created.v1`` → add corpus entry
- ``submission.submission.deleted.v1`` → soft-delete corpus entry
- ``identity.user.anonymized.v1``     → scrub display_name in pairs
- ``course.assignment.created.v1``    → no-op for now (config snapshot)
- ``integration.import.completed.v1`` → if assignment auto_run, enqueue run
"""
from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from ..common.logging import get_logger
from ..config import settings
from ..services.corpus_service import CorpusService

log = get_logger(__name__)


class EventConsumer:
    """Pluggable async consumer.

    For tests we don't need an actual Kafka instance; tests call
    ``handle_message`` directly with the deserialized payload.
    """

    def __init__(
        self,
        *,
        session_factory: async_sessionmaker[AsyncSession],
        on_assignment_import_complete: (
            Callable[[dict[str, Any]], Any] | None
        ) = None,
    ) -> None:
        self.session_factory = session_factory
        self._on_import = on_assignment_import_complete
        self._consumer: Any | None = None
        self._stopped = False

    async def start(self) -> None:
        if self._consumer is not None or settings.env == "test":
            return
        from aiokafka import AIOKafkaConsumer

        topics = (
            settings.kafka_topic_submission,
            settings.kafka_topic_assignment,
            settings.kafka_topic_integration_import,
            settings.kafka_topic_identity_user,
        )
        self._consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=settings.kafka_bootstrap,
            group_id=settings.kafka_consumer_group,
            enable_auto_commit=False,
            auto_offset_reset="latest",
        )
        await self._consumer.start()

    async def stop(self) -> None:
        self._stopped = True
        if self._consumer is None:
            return
        await self._consumer.stop()
        self._consumer = None

    async def handle_message(self, raw: bytes | str | dict[str, Any]) -> None:
        if isinstance(raw, dict):
            payload = raw
        else:
            payload = json.loads(raw)
        evt_type = payload.get("type") or ""
        data = payload.get("data") or {}
        tenant_id = payload.get("tenant_id")
        try:
            if evt_type == "plaglens.submission.submission.created.v1":
                await self._handle_submission_created(tenant_id, data)
            elif evt_type == "plaglens.submission.submission.deleted.v1":
                await self._handle_submission_deleted(data)
            elif evt_type == "plaglens.identity.user.anonymized.v1":
                await self._handle_user_anonymized(tenant_id, data)
            elif (
                evt_type == "plaglens.integration.import.completed.v1"
                and self._on_import is not None
            ):
                await self._on_import(payload)
        except Exception as exc:  # noqa: BLE001
            log.error("event_handler_failed", type=evt_type, error=str(exc))

    # ------------------------------------------------------------------
    # Per-event handlers
    # ------------------------------------------------------------------
    async def _handle_submission_created(
        self, tenant_id: str | None, data: dict[str, Any]
    ) -> None:
        async with self.session_factory() as session:
            cs = CorpusService(session)
            await cs.add_submission(
                tenant_id=tenant_id or data.get("tenant_id", "unknown"),
                course_id=data.get("course_id"),
                assignment_id=data.get("assignment_id"),
                submission_id=data["submission_id"],
                language=data.get("language"),
                source=data.get("source") or data.get("content") or "",
            )
            await session.commit()

    async def _handle_submission_deleted(self, data: dict[str, Any]) -> None:
        async with self.session_factory() as session:
            cs = CorpusService(session)
            await cs.remove_submission(data["submission_id"])
            await session.commit()

    async def _handle_user_anonymized(
        self, tenant_id: str | None, data: dict[str, Any]
    ) -> None:
        from sqlalchemy import update

        from ..models.plagiarism import PlagiarismPair

        user_id = data.get("user_id")
        if not user_id:
            return
        async with self.session_factory() as session:
            await session.execute(
                update(PlagiarismPair)
                .where(PlagiarismPair.tenant_id == (tenant_id or ""))
                .where(PlagiarismPair.a_author_id == user_id)
                .values(a_author_id=None, a_author_display_name="[anonymized]")
            )
            await session.execute(
                update(PlagiarismPair)
                .where(PlagiarismPair.tenant_id == (tenant_id or ""))
                .where(PlagiarismPair.b_author_id == user_id)
                .values(b_author_id=None, b_author_display_name="[anonymized]")
            )
            await session.commit()
