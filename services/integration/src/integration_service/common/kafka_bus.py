"""Kafka producer/consumer wrappers (no-op when disabled)."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

import structlog

from integration_service.config import get_settings

logger = structlog.get_logger(__name__)

try:
    from aiokafka import AIOKafkaConsumer, AIOKafkaProducer  # type: ignore
except Exception:  # pragma: no cover
    AIOKafkaConsumer = None  # type: ignore
    AIOKafkaProducer = None  # type: ignore


class KafkaBus:
    """Single object wrapping producer + consumer task. Safe no-op if disabled."""

    def __init__(self) -> None:
        self.producer: Any = None
        self.consumer: Any = None
        self._consumer_task: Optional[asyncio.Task[None]] = None
        self._handlers: Dict[str, List[Callable[[Dict[str, Any]], Awaitable[None]]]] = {}
        self._running = False
        self._fallback: List[Dict[str, Any]] = []  # used when kafka disabled

    def on(
        self,
        event_type: str,
        handler: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> None:
        self._handlers.setdefault(event_type, []).append(handler)

    async def start(self) -> None:
        s = get_settings()
        if not s.enable_kafka:
            logger.info("kafka.disabled")
            self._running = True
            return
        if AIOKafkaProducer is None:
            logger.warning("aiokafka.unavailable")
            return
        self.producer = AIOKafkaProducer(bootstrap_servers=s.kafka_bootstrap_servers)
        await self.producer.start()
        topics = [s.kafka_topic_assignment, s.kafka_topic_course, s.kafka_topic_tenant]
        self.consumer = AIOKafkaConsumer(
            *topics,
            bootstrap_servers=s.kafka_bootstrap_servers,
            group_id=s.kafka_consumer_group,
            enable_auto_commit=True,
            auto_offset_reset="latest",
        )
        await self.consumer.start()
        self._consumer_task = asyncio.create_task(self._consume_loop())
        self._running = True

    async def stop(self) -> None:
        self._running = False
        if self._consumer_task:
            self._consumer_task.cancel()
            try:
                await self._consumer_task
            except (asyncio.CancelledError, Exception):
                pass
        if self.consumer is not None:
            try:
                await self.consumer.stop()
            except Exception:
                pass
        if self.producer is not None:
            try:
                await self.producer.stop()
            except Exception:
                pass

    async def _consume_loop(self) -> None:
        assert self.consumer is not None
        try:
            async for msg in self.consumer:
                try:
                    event = json.loads(msg.value)
                except Exception:
                    continue
                etype = event.get("type", "")
                for h in self._handlers.get(etype, []):
                    try:
                        await h(event)
                    except Exception as exc:
                        logger.exception("kafka.handler.failed", event_type=etype, error=str(exc))
        except asyncio.CancelledError:
            return

    async def publish(
        self,
        topic: str,
        event_type: str,
        data: Dict[str, Any],
        tenant_id: str = "tnt_default",
        actor: Optional[Dict[str, str]] = None,
        subject: Optional[str] = None,
    ) -> None:
        envelope = {
            "specversion": "1.0",
            "id": f"evt_{uuid.uuid4().hex[:24]}",
            "type": event_type,
            "source": "/services/integration",
            "subject": subject,
            "time": datetime.now(UTC).isoformat(),
            "datacontenttype": "application/json",
            "tenant_id": tenant_id,
            "actor": actor or {"type": "service", "id": "integration-service"},
            "data": data,
        }
        if self.producer is None:
            self._fallback.append({"topic": topic, "envelope": envelope})
            logger.debug("kafka.publish.local", topic=topic, type=event_type)
            return
        await self.producer.send_and_wait(
            topic, json.dumps(envelope).encode("utf-8")
        )

    @property
    def captured(self) -> List[Dict[str, Any]]:
        """Convenience for tests when kafka is disabled."""
        return self._fallback


_bus: Optional[KafkaBus] = None


def get_bus() -> KafkaBus:
    global _bus
    if _bus is None:
        _bus = KafkaBus()
    return _bus


async def reset_bus_for_tests() -> None:
    global _bus
    if _bus is not None:
        await _bus.stop()
    _bus = None
