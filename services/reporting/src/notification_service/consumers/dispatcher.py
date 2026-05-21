"""Multi-topic Kafka consumer (fan-in) for notifications."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.config import get_settings
from notification_service.db import session_scope
from notification_service.delivery import fanout_event
from notification_service.logging import get_logger
from notification_service.models import ProcessedEvent

log = get_logger("consumer")


async def is_already_processed(session: AsyncSession, event_id: str, group: str) -> bool:
    if not event_id:
        return False
    existing = await session.get(ProcessedEvent, event_id)
    if existing is not None:
        return True
    session.add(ProcessedEvent(event_id=event_id, consumer_group=group))
    try:
        await session.flush()
    except Exception:
        await session.rollback()
        return True
    return False


def _broadcast_recipients(event: dict[str, Any]) -> list[str]:
    """For events without explicit recipient(s) — usually budget exceeded; emit
    to admin user_ids passed in metadata if provided."""
    data = event.get("data") or {}
    admins = data.get("admin_user_ids") or []
    if isinstance(admins, list):
        return [str(x) for x in admins]
    return []


async def process_event(event: dict[str, Any]) -> int:
    """Handle a single event payload. Returns number of created notifications."""
    settings = get_settings()
    group = settings.KAFKA_CONSUMER_GROUP
    event_id = str(event.get("id") or "")

    async with session_scope() as session:
        if event_id and await is_already_processed(session, event_id, group):
            return 0
        extra = _broadcast_recipients(event)
        created = await fanout_event(session, event, extra_user_ids=extra)
    return len(created)


class KafkaDispatcher:
    """Wraps aiokafka.AIOKafkaConsumer over multiple topics.

    Designed to be optional — when KAFKA_DISABLED, we don't import aiokafka
    so test environments without Kafka still work.
    """

    def __init__(self) -> None:
        self._task: asyncio.Task[None] | None = None
        self._consumer: Any = None
        self._stop_event = asyncio.Event()

    async def start(self) -> None:
        settings = get_settings()
        if settings.KAFKA_DISABLED:
            log.info("kafka_dispatcher_disabled")
            return
        try:
            from aiokafka import AIOKafkaConsumer  # type: ignore[import-not-found]
        except Exception as e:
            log.warning("aiokafka_import_failed", error=str(e))
            return
        self._consumer = AIOKafkaConsumer(
            *settings.KAFKA_TOPICS,
            bootstrap_servers=settings.KAFKA_BROKERS,
            group_id=settings.KAFKA_CONSUMER_GROUP,
            enable_auto_commit=True,
            auto_offset_reset="latest",
            value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        )
        try:
            await self._consumer.start()
        except Exception as e:
            log.warning("kafka_consumer_start_failed", error=str(e))
            self._consumer = None
            return
        self._task = asyncio.create_task(self._run(), name="kafka-dispatcher")
        log.info("kafka_dispatcher_started", topics=list(settings.KAFKA_TOPICS))

    async def _run(self) -> None:
        assert self._consumer is not None
        try:
            async for msg in self._consumer:
                if self._stop_event.is_set():
                    break
                try:
                    await process_event(msg.value)
                except Exception as e:  # noqa: BLE001
                    log.error(
                        "consumer_process_failed",
                        error=str(e),
                        event_id=(msg.value or {}).get("id"),
                    )
        finally:
            try:
                await self._consumer.stop()
            except Exception:
                pass

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
        if self._consumer is not None:
            try:
                await self._consumer.stop()
            except Exception:
                pass


async def publish_event(topic: str, payload: dict[str, Any]) -> None:
    """Best-effort fire-and-forget Kafka producer for outbound events.

    No-op when Kafka is disabled or aiokafka isn't installed — used for
    cross-service signals like ``notification.email_disabled.v1``.
    """
    settings = get_settings()
    if settings.KAFKA_DISABLED:
        return
    try:
        from aiokafka import AIOKafkaProducer  # type: ignore[import-not-found]
    except Exception:
        return
    producer = AIOKafkaProducer(
        bootstrap_servers=settings.KAFKA_BROKERS,
        value_serializer=lambda v: json.dumps(v).encode("utf-8"),
    )
    try:
        await producer.start()
        await producer.send_and_wait(topic, payload)
    except Exception as e:  # noqa: BLE001
        log.warning("publish_event_failed", topic=topic, error=str(e))
    finally:
        try:
            await producer.stop()
        except Exception:
            pass
