"""Kafka producer wrapper."""
from __future__ import annotations

import json
import logging
from typing import Any

from ..common.events import CloudEvent
from ..config import get_settings

logger = logging.getLogger(__name__)


class EventPublisher:
    """Publishes CloudEvents to Kafka.

    With ``KAFKA_DISABLED`` events are buffered to ``self.captured`` only
    (this is what tests inspect).
    """

    def __init__(self) -> None:
        self.captured: list[tuple[str, CloudEvent]] = []
        self._producer: Any | None = None
        self._started = False

    async def start(self) -> None:
        if self._started:
            return
        settings = get_settings()
        if settings.KAFKA_DISABLED:
            self._started = True
            return
        try:
            from aiokafka import AIOKafkaProducer

            self._producer = AIOKafkaProducer(
                bootstrap_servers=settings.KAFKA_BROKERS,
                value_serializer=lambda v: json.dumps(v, default=str).encode("utf-8"),
                acks="all",
                enable_idempotence=True,
            )
            await self._producer.start()
        except Exception:
            logger.exception("Kafka producer start failed; falling back to no-op")
            self._producer = None
        self._started = True

    async def stop(self) -> None:
        if self._producer is not None:
            try:
                await self._producer.stop()
            except Exception:
                logger.exception("Kafka producer stop failed")
        self._producer = None
        self._started = False

    @staticmethod
    def topic_for(event_type: str) -> str:
        # type: plaglens.{service}.{domain}.{action}.v1
        # topic: plaglens.{service}.{domain}.v1
        if event_type.startswith("plaglens."):
            base = event_type
        else:
            base = f"plaglens.{event_type}"
        parts = base.split(".")
        if len(parts) < 4:
            return base
        prefix, service, domain = parts[0], parts[1], parts[2]
        version = parts[-1]
        return f"{prefix}.{service}.{domain}.{version}"

    async def publish(self, event: CloudEvent) -> None:
        topic = self.topic_for(event.type)
        self.captured.append((topic, event))
        if self._producer is None:
            return
        headers = []
        if event.tenant_id:
            headers.append(("tenant_id", event.tenant_id.encode()))
        if event.trace_id:
            headers.append(("trace_id", event.trace_id.encode()))
        try:
            await self._producer.send_and_wait(
                topic,
                value=event.model_dump(mode="json"),
                key=(event.tenant_id or "").encode() or None,
                headers=headers,
            )
        except Exception:
            logger.exception("Kafka publish failed for topic=%s", topic)


_publisher: EventPublisher | None = None


def get_publisher() -> EventPublisher:
    global _publisher
    if _publisher is None:
        _publisher = EventPublisher()
    return _publisher


def reset_publisher() -> None:
    global _publisher
    _publisher = None
