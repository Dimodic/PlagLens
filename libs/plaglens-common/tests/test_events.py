from __future__ import annotations

from typing import Any

import pytest

from plaglens_common.events import (
    CloudEvent,
    InMemoryProcessedEventStore,
    KafkaEventConsumer,
    KafkaEventProducer,
)


def test_cloudevent_defaults_and_serialisation() -> None:
    ev = CloudEvent(
        type="plaglens.submission.submission.created.v1",
        source="/services/submission",
        tenant_id="tnt_1",
        data={"submission_id": "sub_1"},
    )
    assert ev.specversion == "1.0"
    assert ev.id.startswith("evt_")
    payload = ev.to_kafka_value()
    decoded = CloudEvent.from_kafka_value(payload)
    assert decoded.type == ev.type
    assert decoded.data == ev.data
    headers = dict(ev.kafka_headers())
    assert headers["ce_tenant_id"] == b"tnt_1"
    assert headers["ce_type"] == b"plaglens.submission.submission.created.v1"


@pytest.mark.asyncio
async def test_in_memory_processed_store_dedup() -> None:
    store = InMemoryProcessedEventStore()
    assert await store.is_processed("evt_1", consumer_group="g") is False
    await store.mark_processed("evt_1", consumer_group="g")
    assert await store.is_processed("evt_1", consumer_group="g") is True
    assert await store.is_processed("evt_1", consumer_group="g2") is False


class _FakeProducer:
    def __init__(self, **kw: Any) -> None:
        self.kw = kw
        self.started = False
        self.sent: list[tuple[str, bytes, bytes, list[tuple[str, bytes]]]] = []

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    async def send_and_wait(
        self,
        topic: str,
        *,
        value: bytes,
        key: bytes,
        headers: list[tuple[str, bytes]],
    ) -> None:
        self.sent.append((topic, value, key, headers))


@pytest.mark.asyncio
async def test_producer_publish_serialises_and_keys_by_tenant() -> None:
    fake = _FakeProducer()
    producer = KafkaEventProducer(
        bootstrap_servers="localhost:9092",
        producer_factory=lambda **kw: (fake.__init__(**kw) or fake),  # type: ignore[func-returns-value]
    )
    await producer.start()
    ev = CloudEvent(type="x.y.z.v1", source="/svc", tenant_id="tnt_42", data={"a": 1})
    await producer.publish("plaglens.test.v1", ev)
    await producer.stop()

    assert len(fake.sent) == 1
    topic, value, key, _ = fake.sent[0]
    assert topic == "plaglens.test.v1"
    assert key == b"tnt_42"
    assert b'"type":"x.y.z.v1"' in value


class _FakeRecord:
    def __init__(self, value: bytes) -> None:
        self.value = value


class _FakeConsumer:
    def __init__(self, *topics: str, **kw: Any) -> None:
        self.topics = topics
        self.kw = kw
        self.started = False
        self.commits = 0
        self._records: list[_FakeRecord] = []

    def feed(self, *records: _FakeRecord) -> None:
        self._records.extend(records)

    async def start(self) -> None:
        self.started = True

    async def stop(self) -> None:
        self.started = False

    async def commit(self) -> None:
        self.commits += 1

    def __aiter__(self) -> _FakeConsumer:
        return self

    async def __anext__(self) -> _FakeRecord:
        if not self._records:
            raise StopAsyncIteration
        return self._records.pop(0)


@pytest.mark.asyncio
async def test_consumer_skips_already_processed_events() -> None:
    fake = _FakeConsumer()
    ev1 = CloudEvent(type="t.v1", source="/s", id="evt_1", data={})
    ev2 = CloudEvent(type="t.v1", source="/s", id="evt_2", data={})

    store = InMemoryProcessedEventStore()
    await store.mark_processed("evt_1", consumer_group="g")

    handled: list[str] = []

    async def handler(ev: CloudEvent) -> None:
        handled.append(ev.id)

    consumer = KafkaEventConsumer(
        "localhost:9092",
        topics=["plaglens.test.v1"],
        group_id="g",
        store=store,
        consumer_factory=lambda *t, **kw: fake,
    )
    # Feed records *after* the factory is wired so the fake's state isn't reset.
    fake.feed(_FakeRecord(ev1.to_kafka_value()), _FakeRecord(ev2.to_kafka_value()))
    await consumer.run(handler)

    assert handled == ["evt_2"]
    assert fake.commits == 2
