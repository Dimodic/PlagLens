"""CloudEvents + Kafka producer for identity.

Thin adapters over the shared :mod:`plaglens_common.events` so identity does
not re-implement the CloudEvents envelope or the aiokafka wrapper. ``CloudEvent``
is re-exported as-is; ``KafkaProducer`` keeps identity's
``(brokers: list[str])`` / ``publish(topic, event)`` call-site interface but
delegates to the shared ``KafkaEventProducer``; ``StubProducer`` collects events
for unit tests.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from plaglens_common.events import CloudEvent, KafkaEventProducer

logger = logging.getLogger(__name__)

_SOURCE = "/services/identity"


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
        source=_SOURCE,
        data=data,
        tenant_id=tenant_id,
        subject=subject,
        actor=actor,
        trace_id=trace_id,
    )


class KafkaProducer:
    """Identity's ``(brokers: list[str])`` interface over the shared producer."""

    def __init__(self, brokers: list[str]) -> None:
        self._enabled = bool(brokers)
        self._producer: Optional[KafkaEventProducer] = (
            KafkaEventProducer(",".join(brokers)) if self._enabled else None
        )

    async def start(self) -> None:
        if self._producer is None:
            logger.info("Kafka producer disabled (no brokers configured)")
            return
        try:
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
        if self._producer is None:
            logger.info("[event] %s -> %s %s", topic, event.type, event.id)
            return
        try:
            await self._producer.publish(topic, event)
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


async def publish_user_event(
    request: Any,
    event_type: str,
    *,
    data: dict[str, Any],
    tenant_id: Optional[str] = None,
    subject: Optional[str] = None,
    actor: Optional[dict[str, Any]] = None,
) -> None:
    """Publish an identity-domain user event from any route handler.

    Pulls the Kafka producer from ``request.app.state.producer`` (initialised
    in :func:`identity_service.main.lifespan`). Best-effort: any error is
    logged and swallowed so the user-facing request never fails because the
    event bus is down.
    """
    producer = getattr(getattr(request.app, "state", None), "producer", None)
    if producer is None:
        logger.info("[event] no producer wired; dropping %s", event_type)
        return
    # Lazy import to avoid an import cycle with config at module-load time.
    from ..config import get_settings

    try:
        event = make_event(
            event_type,
            data=data,
            tenant_id=tenant_id,
            subject=subject,
            actor=actor,
        )
        await producer.publish(get_settings().kafka_topic_user, event)
    except Exception as exc:  # pragma: no cover - best-effort
        logger.warning("Failed to publish %s: %s", event_type, exc)


__all__ = [
    "CloudEvent",
    "KafkaProducer",
    "StubProducer",
    "event_to_json",
    "make_event",
    "publish_user_event",
]
