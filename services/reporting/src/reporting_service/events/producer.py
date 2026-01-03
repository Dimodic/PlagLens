"""Kafka producer wrapper that degrades to in-memory queue when unavailable."""
from __future__ import annotations

import asyncio
import json
from typing import Any


class EventProducer:
    """Thin wrapper compatible with aiokafka.AIOKafkaProducer + an in-mem fallback.

    For the reporting service we only emit a small number of topics
    (``reporting.export.*``). When Kafka is unreachable, the events are
    appended to ``self.published`` so they remain inspectable for tests.
    """

    def __init__(self, bootstrap: str | None = None):
        self.bootstrap = bootstrap
        self._client = None
        self._lock = asyncio.Lock()
        self.published: list[tuple[str, dict[str, Any]]] = []

    async def start(self) -> None:
        if not self.bootstrap:
            return
        try:
            from aiokafka import AIOKafkaProducer  # type: ignore

            self._client = AIOKafkaProducer(bootstrap_servers=self.bootstrap)
            await self._client.start()
        except Exception:
            self._client = None

    async def stop(self) -> None:
        if self._client is not None:
            try:
                await self._client.stop()
            except Exception:
                pass
            self._client = None

    async def publish(self, topic: str, envelope: dict[str, Any]) -> None:
        async with self._lock:
            self.published.append((topic, envelope))
        if self._client is None:
            return
        try:
            await self._client.send_and_wait(
                topic,
                json.dumps(envelope).encode(),
                key=(envelope.get("tenant_id") or "").encode(),
            )
        except Exception:
            pass
