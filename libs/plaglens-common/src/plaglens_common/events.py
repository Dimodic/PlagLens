"""CloudEvents envelope + thin async Kafka producer/consumer.

See `docs/architecture/legacy/03-EVENTS.md`.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class CloudEvent(BaseModel):
    """Subset of CloudEvents v1.0 used across PlagLens.

    Tenant routing requires `tenant_id` as a top-level extension.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    specversion: str = "1.0"
    id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex}")
    type: str
    source: str
    subject: str | None = None
    time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    datacontenttype: str = "application/json"
    tenant_id: str | None = None
    actor: dict[str, Any] | None = None
    trace_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)

    def to_kafka_value(self) -> bytes:
        return self.model_dump_json(exclude_none=True).encode("utf-8")

    @classmethod
    def from_kafka_value(cls, value: bytes | str) -> CloudEvent:
        text = value.decode("utf-8") if isinstance(value, bytes | bytearray) else value
        return cls.model_validate_json(text)

    def kafka_headers(self) -> list[tuple[str, bytes]]:
        out: list[tuple[str, bytes]] = [
            ("ce_specversion", self.specversion.encode("utf-8")),
            ("ce_type", self.type.encode("utf-8")),
            ("ce_id", self.id.encode("utf-8")),
        ]
        if self.tenant_id:
            out.append(("ce_tenant_id", self.tenant_id.encode("utf-8")))
        if self.trace_id:
            out.append(("ce_trace_id", self.trace_id.encode("utf-8")))
        return out


class ProcessedEventStore(Protocol):
    """DI Protocol used by `KafkaEventConsumer` for idempotency.

    Implementations may be backed by SQL (`processed_events` per §4) or Redis.
    """

    async def is_processed(self, event_id: str, *, consumer_group: str) -> bool: ...
    async def mark_processed(self, event_id: str, *, consumer_group: str) -> None: ...


class InMemoryProcessedEventStore:
    """Tiny default implementation, **not** for production."""

    def __init__(self) -> None:
        self._seen: set[tuple[str, str]] = set()

    async def is_processed(self, event_id: str, *, consumer_group: str) -> bool:
        return (consumer_group, event_id) in self._seen

    async def mark_processed(self, event_id: str, *, consumer_group: str) -> None:
        self._seen.add((consumer_group, event_id))


class KafkaEventProducer:
    """Async wrapper around `aiokafka.AIOKafkaProducer`.

    `start()` / `stop()` are idempotent. `publish()` serialises the `CloudEvent`
    and partitions on `tenant_id` (so per-tenant ordering is preserved).
    """

    def __init__(
        self,
        bootstrap_servers: str,
        *,
        client_id: str | None = None,
        producer_factory: Any = None,
        **kwargs: Any,
    ) -> None:
        self._bootstrap = bootstrap_servers
        self._client_id = client_id
        self._extra = kwargs
        self._producer: Any = None
        self._factory = producer_factory
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        async with self._lock:
            if self._producer is not None:
                return
            factory = self._factory
            if factory is None:
                from aiokafka import AIOKafkaProducer  # type: ignore[import-not-found]

                factory = AIOKafkaProducer
            self._producer = factory(
                bootstrap_servers=self._bootstrap,
                client_id=self._client_id,
                **self._extra,
            )
            await self._producer.start()

    async def stop(self) -> None:
        async with self._lock:
            if self._producer is None:
                return
            await self._producer.stop()
            self._producer = None

    async def publish(self, topic: str, event: CloudEvent, *, key: str | None = None) -> None:
        if self._producer is None:
            await self.start()
        assert self._producer is not None
        partition_key = (key or event.tenant_id or event.id).encode("utf-8")
        await self._producer.send_and_wait(
            topic,
            value=event.to_kafka_value(),
            key=partition_key,
            headers=event.kafka_headers(),
        )

    async def __aenter__(self) -> KafkaEventProducer:
        await self.start()
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.stop()


HandlerT = Callable[[CloudEvent], Awaitable[None]]


class KafkaEventConsumer:
    """Async consumer that decodes CloudEvents and applies idempotency."""

    def __init__(
        self,
        bootstrap_servers: str,
        topics: list[str],
        group_id: str,
        store: ProcessedEventStore,
        *,
        consumer_factory: Any = None,
        auto_offset_reset: str = "earliest",
        **kwargs: Any,
    ) -> None:
        self._bootstrap = bootstrap_servers
        self._topics = list(topics)
        self._group = group_id
        self._store = store
        self._auto_offset = auto_offset_reset
        self._extra = kwargs
        self._consumer: Any = None
        self._factory = consumer_factory
        self._stopped = False

    async def start(self) -> None:
        if self._consumer is not None:
            return
        factory = self._factory
        if factory is None:
            from aiokafka import AIOKafkaConsumer  # type: ignore[import-not-found]

            factory = AIOKafkaConsumer
        self._consumer = factory(
            *self._topics,
            bootstrap_servers=self._bootstrap,
            group_id=self._group,
            auto_offset_reset=self._auto_offset,
            enable_auto_commit=False,
            **self._extra,
        )
        await self._consumer.start()

    async def stop(self) -> None:
        self._stopped = True
        if self._consumer is None:
            return
        await self._consumer.stop()
        self._consumer = None

    async def run(self, handler: HandlerT) -> None:
        """Consume forever; idempotent through `ProcessedEventStore`."""

        if self._consumer is None:
            await self.start()
        assert self._consumer is not None

        async for record in self._consumer:
            try:
                event = CloudEvent.from_kafka_value(record.value)
            except Exception:
                logger.exception("Failed to decode event; skipping offset commit")
                continue

            if await self._store.is_processed(event.id, consumer_group=self._group):
                await self._consumer.commit()
                continue

            try:
                await handler(event)
            except Exception:
                logger.exception("Handler failed for event %s", event.id)
                # Do not commit -> Kafka will redeliver after rebalance / retry policy.
                continue

            await self._store.mark_processed(event.id, consumer_group=self._group)
            await self._consumer.commit()

            if self._stopped:
                break


__all__ = [
    "CloudEvent",
    "InMemoryProcessedEventStore",
    "KafkaEventConsumer",
    "KafkaEventProducer",
    "ProcessedEventStore",
]
