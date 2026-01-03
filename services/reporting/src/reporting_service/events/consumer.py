"""Kafka consumer that dispatches to read-model handlers idempotently."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import Any, Awaitable, Callable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from ..common.time import utcnow
from ..models.reporting import ProcessedEvent, ReadModelHealth

HandlerFn = Callable[[Any, dict[str, Any]], Awaitable[None]]


class EventConsumer:
    """In-process event router. Public ``ingest`` is used both by aiokafka
    background tasks (when configured) and by tests directly.
    """

    def __init__(self, session_maker: async_sessionmaker, handlers: dict[str, list[HandlerFn]]):
        self.session_maker = session_maker
        self.handlers = handlers
        self._lock = asyncio.Lock()
        self._client = None

    def topics(self) -> list[str]:
        # Top-level Kafka topics; types are mapped per envelope.type
        return sorted({h.split(".")[0] for h in self.handlers.keys()})

    async def ingest(self, envelope: dict[str, Any]) -> bool:
        """Dispatch a parsed CloudEvents envelope to handlers.

        Returns True if processed (or already processed = no-op), False on
        unknown event type.
        """
        evt_id = envelope.get("id")
        evt_type = envelope.get("type")
        if not evt_id or not evt_type:
            return False
        async with self.session_maker() as session:
            already = await session.get(ProcessedEvent, evt_id)
            if already is not None:
                return True
            handlers = self.handlers.get(evt_type, [])
            if not handlers:
                # still mark as seen to avoid loops
                session.add(ProcessedEvent(event_id=evt_id, consumer_group="reporting"))
                await session.commit()
                return False
            for fn in handlers:
                await fn(session, envelope)
            session.add(ProcessedEvent(event_id=evt_id, consumer_group="reporting"))
            # update read-model health
            stmt = select(ReadModelHealth).where(ReadModelHealth.name == evt_type.split(".")[0])
            health = (await session.execute(stmt)).scalar_one_or_none()
            now = utcnow()
            evt_time_raw = envelope.get("time")
            evt_time: datetime | None = None
            if evt_time_raw:
                try:
                    evt_time = datetime.fromisoformat(evt_time_raw.replace("Z", "+00:00"))
                except Exception:
                    evt_time = None
            if health is None:
                session.add(
                    ReadModelHealth(
                        name=evt_type.split(".")[0],
                        last_event_at=evt_time,
                        last_processed_at=now,
                        lag_seconds=0.0,
                    )
                )
            else:
                health.last_event_at = evt_time or health.last_event_at
                health.last_processed_at = now
                if evt_time:
                    health.lag_seconds = max(0.0, (now - evt_time).total_seconds())
            await session.commit()
        return True

    async def start(self, bootstrap: str | None) -> None:
        if not bootstrap:
            return
        try:
            from aiokafka import AIOKafkaConsumer  # type: ignore

            self._client = AIOKafkaConsumer(
                *self.topics(),
                bootstrap_servers=bootstrap,
                group_id="reporting-service",
                enable_auto_commit=True,
                auto_offset_reset="earliest",
            )
            await self._client.start()
        except Exception:
            self._client = None

    async def run_forever(self) -> None:  # pragma: no cover - integration only
        if self._client is None:
            return
        try:
            async for msg in self._client:
                try:
                    env = json.loads(msg.value.decode())
                    await self.ingest(env)
                except Exception:
                    continue
        finally:
            await self._client.stop()

    async def stop(self) -> None:
        if self._client is not None:
            try:
                await self._client.stop()
            except Exception:
                pass
            self._client = None
