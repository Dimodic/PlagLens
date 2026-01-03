"""Kafka producer abstraction.

We expose two implementations:
- ``AioKafkaProducer`` — production, wraps ``aiokafka``.
- ``NullEventProducer`` — used by tests / local-dev (env=test). Captures all
  emitted events in-memory so tests can assert on them.
"""
from __future__ import annotations

import json
from typing import Any

from ..common.events import CloudEvent
from ..common.logging import get_logger
from ..config import settings

log = get_logger(__name__)


class EventProducer:
    """Abstract async Kafka producer."""

    async def start(self) -> None:  # pragma: no cover
        return None

    async def stop(self) -> None:  # pragma: no cover
        return None

    async def publish(
        self,
        topic: str,
        event: CloudEvent,
        *,
        key: bytes | None = None,
    ) -> None:  # pragma: no cover
        raise NotImplementedError


class NullEventProducer(EventProducer):
    """Captures published events in-memory."""

    def __init__(self) -> None:
        self.events: list[tuple[str, CloudEvent]] = []
        self.started = False

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    async def publish(
        self,
        topic: str,
        event: CloudEvent,
        *,
        key: bytes | None = None,
    ) -> None:
        self.events.append((topic, event))


class AioKafkaProducer(EventProducer):
    def __init__(self, bootstrap: str | None = None) -> None:
        self.bootstrap = bootstrap or settings.kafka_bootstrap
        self._producer: Any | None = None

    async def start(self) -> None:
        if self._producer is not None:
            return
        from aiokafka import AIOKafkaProducer

        self._producer = AIOKafkaProducer(
            bootstrap_servers=self.bootstrap,
            enable_idempotence=True,
            client_id=settings.service_name,
        )
        await self._producer.start()

    async def stop(self) -> None:
        if self._producer is None:
            return
        await self._producer.stop()
        self._producer = None

    async def publish(
        self,
        topic: str,
        event: CloudEvent,
        *,
        key: bytes | None = None,
    ) -> None:
        if self._producer is None:
            await self.start()
        assert self._producer is not None
        payload = event.model_dump(mode="json")
        body = json.dumps(payload, separators=(",", ":")).encode()
        await self._producer.send_and_wait(
            topic,
            body,
            key=key or (event.tenant_id or "").encode(),
        )


def get_producer() -> EventProducer:
    if settings.env == "test":
        return NullEventProducer()
    return AioKafkaProducer()
