"""Kafka consumer: subscribes to all `plaglens.*` topics by regex.

Each message is interpreted as a CloudEvents-compatible JSON document and
turned into an AuditEvent (idempotent by event id).
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from ..common.logging import get_logger
from ..config import settings
from .ingest import ingest_kafka_event

log = get_logger("audit.consumer")


class AuditKafkaConsumer:
    def __init__(
        self,
        session_factory: async_sessionmaker,
        *,
        brokers: list[str] | None = None,
        topic_pattern: str | None = None,
        group_id: str | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._brokers = brokers or settings.kafka_brokers_list
        self._pattern = topic_pattern or settings.kafka_topic_pattern
        self._group_id = group_id or settings.kafka_group_id
        self._task: asyncio.Task[Any] | None = None
        self._consumer = None
        self._stopping = asyncio.Event()

    async def start(self) -> None:
        if settings.kafka_disabled:
            log.info("audit.consumer.disabled")
            return
        try:
            from aiokafka import AIOKafkaConsumer  # type: ignore
        except Exception as exc:  # noqa: BLE001
            log.warning("audit.consumer.aiokafka_unavailable", error=str(exc))
            return

        self._consumer = AIOKafkaConsumer(
            bootstrap_servers=self._brokers,
            group_id=self._group_id,
            enable_auto_commit=True,
            auto_offset_reset="latest",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")) if v else None,
        )
        # Subscribe by regex pattern across all plaglens.* topics.
        self._consumer.subscribe(pattern=re.compile(self._pattern))
        await self._consumer.start()
        self._task = asyncio.create_task(self._run(), name="audit-kafka-consumer")
        log.info("audit.consumer.started", pattern=self._pattern)

    async def stop(self) -> None:
        self._stopping.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        if self._consumer is not None:
            try:
                await self._consumer.stop()
            except Exception:  # noqa: BLE001
                pass
        log.info("audit.consumer.stopped")

    async def _run(self) -> None:
        assert self._consumer is not None
        try:
            async for message in self._consumer:
                if self._stopping.is_set():
                    break
                await self._process_one(message.value)
        except asyncio.CancelledError:
            return
        except Exception as exc:  # noqa: BLE001
            log.error("audit.consumer.crash", error=str(exc))

    async def _process_one(self, value: dict | None) -> None:
        if not isinstance(value, dict):
            return
        async with self._session_factory() as session:
            try:
                await ingest_kafka_event(
                    session, value, consumer_group=self._group_id
                )
                await session.commit()
            except Exception as exc:  # noqa: BLE001
                await session.rollback()
                log.error("audit.consumer.process_failed", error=str(exc))


async def process_event_for_test(
    session_factory: async_sessionmaker,
    event: dict,
    *,
    group_id: str = "audit-service-test",
) -> None:
    """Test helper: synchronously runs the same code-path as the consumer."""
    async with session_factory() as session:
        await ingest_kafka_event(session, event, consumer_group=group_id)
        await session.commit()
