"""CloudEvents envelope + Kafka producer wrapper.

The producer is a thin wrapper that lazily imports aiokafka so tests can run
without a broker. It also tolerates a stub ``producer`` (e.g. one that just
collects events) for unit tests.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class CloudEvent(BaseModel):
    """CloudEvents 1.0 spec, plus PlagLens extensions (tenant_id, actor, trace_id)."""

    specversion: str = "1.0"
    id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex}")
    type: str
    source: str = "/services/identity"
    subject: Optional[str] = None
    time: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    datacontenttype: str = "application/json"
    tenant_id: Optional[str] = None
    actor: Optional[dict[str, Any]] = None
    trace_id: Optional[str] = None
    data: dict[str, Any] = Field(default_factory=dict)


def make_event(
    event_type: str,
    *,
    data: dict[str, Any],
    tenant_id: Optional[str] = None,
    subject: Optional[str] = None,
    actor: Optional[dict[str, Any]] = None,
    trace_id: Optional[str] = None,
) -> CloudEvent:
    return CloudEvent(
        type=event_type,
        data=data,
        tenant_id=tenant_id,
        subject=subject,
        actor=actor,
        trace_id=trace_id,
    )


class KafkaProducer:
    """Lazy aiokafka wrapper — no-op if ``brokers`` is empty or aiokafka missing."""

    def __init__(self, brokers: list[str]) -> None:
        self.brokers = brokers
        self._producer: Optional[Any] = None
        self._enabled = bool(brokers)

    async def start(self) -> None:
        if not self._enabled:
            logger.info("Kafka producer disabled (no brokers configured)")
            return
        try:
            from aiokafka import AIOKafkaProducer  # type: ignore

            self._producer = AIOKafkaProducer(bootstrap_servers=self.brokers)
            await self._producer.start()
        except Exception as exc:  # pragma: no cover (depends on infra)
            logger.warning("Kafka producer init failed: %s", exc)
            self._producer = None

    async def stop(self) -> None:
        if self._producer is not None:
            try:
                await self._producer.stop()
            except Exception:  # pragma: no cover
                pass
        self._producer = None

    async def publish(self, topic: str, event: CloudEvent) -> None:
        payload = event.model_dump_json().encode("utf-8")
        headers = []
        if event.tenant_id:
            headers.append(("tenant_id", event.tenant_id.encode("utf-8")))
        if self._producer is None:
            logger.info("[event] %s -> %s %s", topic, event.type, event.id)
            return
        try:
            await self._producer.send_and_wait(topic, payload, headers=headers)
        except Exception as exc:  # pragma: no cover
            logger.warning("Kafka publish failed: %s (event %s)", exc, event.id)


class StubProducer:
    """In-memory producer for tests; collects events for assertions."""

    def __init__(self) -> None:
        self.events: list[tuple[str, CloudEvent]] = []

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    async def publish(self, topic: str, event: CloudEvent) -> None:
        self.events.append((topic, event))


def event_to_json(event: CloudEvent) -> str:
    return json.dumps(event.model_dump(), default=str)
