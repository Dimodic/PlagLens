"""Kafka producer wrapper."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ..common.events import CloudEvent
from ..config import get_settings

logger = logging.getLogger(__name__)

# Hard cap on a single Kafka send. If the broker is unresponsive we'd rather
# drop the notification event than make the user's HTTP request hang. Set
# generously high enough to absorb a single GC pause or leader rebalance.
_PUBLISH_TIMEOUT_S = 3.0


class EventPublisher:
    """Publishes CloudEvents to Kafka.

    When ``KAFKA_DISABLED`` is true, events are buffered in-memory. Tests can
    inspect ``self.captured`` to verify publish behaviour.

    ``publish()`` is fire-and-forget — the actual broker round-trip runs in
    a background task with a bounded timeout. The HTTP handler that calls
    publish never waits for the broker; if Kafka is slow or unreachable the
    event is logged and dropped instead of blocking the response.
    """

    def __init__(self) -> None:
        self.captured: list[tuple[str, CloudEvent]] = []
        self._producer: Any | None = None
        self._started = False
        # Track in-flight background sends so shutdown can await them
        # (and so they aren't GC'd before completion — `create_task` only
        # holds a weak reference).
        self._pending: set[asyncio.Task[None]] = set()

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
        # Let in-flight publishes finish (bounded by their own timeout) so
        # we don't lose events on a clean shutdown.
        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)
        if self._producer is not None:
            try:
                await self._producer.stop()
            except Exception:
                logger.exception("Kafka producer stop failed")
        self._producer = None
        self._started = False

    @staticmethod
    def topic_for(event_type: str) -> str:
        # type pattern: plaglens.{service}.{domain}.{action}.v1
        # topic pattern: plaglens.{service}.{domain}.v1
        parts = event_type.split(".")
        if len(parts) < 4:
            return f"plaglens.{event_type}"
        prefix, service, domain = parts[0], parts[1], parts[2]
        version = parts[-1]
        return f"{prefix}.{service}.{domain}.{version}"

    async def publish(self, event: CloudEvent) -> None:
        """Schedule a publish. Returns immediately — the broker call runs
        in the background with a bounded timeout so HTTP handlers never
        block on Kafka."""
        topic = self.topic_for(event.type)
        self.captured.append((topic, event))
        if self._producer is None:
            return
        task = asyncio.create_task(self._send_with_timeout(topic, event))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def _send_with_timeout(self, topic: str, event: CloudEvent) -> None:
        headers: list[tuple[str, bytes]] = []
        if event.tenant_id:
            headers.append(("tenant_id", event.tenant_id.encode()))
        if event.trace_id:
            headers.append(("trace_id", event.trace_id.encode()))
        try:
            await asyncio.wait_for(
                self._producer.send_and_wait(
                    topic,
                    value=event.model_dump(mode="json"),
                    key=(event.tenant_id or "").encode() or None,
                    headers=headers,
                ),
                timeout=_PUBLISH_TIMEOUT_S,
            )
        except TimeoutError:
            logger.warning(
                "Kafka publish timed out after %.1fs for topic=%s; dropping",
                _PUBLISH_TIMEOUT_S,
                topic,
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
