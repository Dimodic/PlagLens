"""CloudEvents envelope + Kafka producer wrapper."""

from __future__ import annotations

import asyncio
import contextlib
import json
import uuid
from datetime import UTC, datetime
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# Hard cap on a single Kafka send. If the broker is slow we'd rather drop
# the notification event than make the user's HTTP request hang.
_PUBLISH_TIMEOUT_S = 3.0


def utcnow() -> datetime:
    return datetime.now(tz=UTC)


def build_envelope(
    *,
    event_type: str,
    subject: str,
    tenant_id: str,
    actor: dict[str, Any],
    data: dict[str, Any],
    source: str = "/services/course",
    trace_id: str | None = None,
) -> dict[str, Any]:
    return {
        "specversion": "1.0",
        "id": f"evt_{uuid.uuid4().hex[:24]}",
        "type": event_type,
        "source": source,
        "subject": subject,
        "time": utcnow().isoformat().replace("+00:00", "Z"),
        "datacontenttype": "application/json",
        "tenant_id": tenant_id,
        "actor": actor,
        "trace_id": trace_id,
        "data": data,
    }


class KafkaProducer:
    """Thin wrapper over aiokafka.AIOKafkaProducer with a no-op fallback."""

    def __init__(self, brokers: str, *, enabled: bool) -> None:
        self.brokers = brokers
        self.enabled = enabled
        self._producer: Any | None = None
        self._published: list[dict[str, Any]] = []
        # Background sends so HTTP handlers never wait for Kafka.
        self._pending: set[asyncio.Task[None]] = set()

    @property
    def published(self) -> list[dict[str, Any]]:
        """Test introspection: events captured locally when Kafka is disabled."""
        return self._published

    async def start(self) -> None:
        if not self.enabled:
            return
        try:
            from aiokafka import AIOKafkaProducer  # type: ignore[import-untyped]

            self._producer = AIOKafkaProducer(bootstrap_servers=self.brokers)
            await self._producer.start()
        except Exception as exc:
            logger.warning("kafka.producer_start_failed", error=str(exc))
            self._producer = None
            self.enabled = False

    async def stop(self) -> None:
        # Let in-flight sends finish (bounded by their own timeout) so we
        # don't drop events on clean shutdown.
        if self._pending:
            await asyncio.gather(*self._pending, return_exceptions=True)
        if self._producer is not None:
            with contextlib.suppress(Exception):
                await self._producer.stop()
            self._producer = None

    async def publish(self, topic: str, envelope: dict[str, Any]) -> None:
        """Schedule a publish. Returns immediately — the broker call runs
        in the background with a bounded timeout so HTTP handlers never
        block on Kafka."""
        self._published.append({"topic": topic, "envelope": envelope})
        logger.info(
            "event.publish",
            topic=topic,
            type=envelope["type"],
            tenant_id=envelope.get("tenant_id"),
            event_id=envelope["id"],
        )
        if not self.enabled or self._producer is None:
            return
        task = asyncio.create_task(self._send_with_timeout(topic, envelope))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def _send_with_timeout(self, topic: str, envelope: dict[str, Any]) -> None:
        try:
            payload = json.dumps(envelope).encode("utf-8")
            key = (envelope.get("tenant_id") or "").encode("utf-8")
            await asyncio.wait_for(
                self._producer.send_and_wait(topic, payload, key=key),
                timeout=_PUBLISH_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "event.publish_timeout",
                topic=topic,
                timeout_s=_PUBLISH_TIMEOUT_S,
            )
        except Exception as exc:
            logger.error("event.publish_failed", topic=topic, error=str(exc))
