"""FastAPI dependencies (DB session, principal, services)."""
from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.idempotency import IdempotencyStore
from ..common.rbac import Principal, get_principal
from ..db import get_session_factory
from ..events.producer import EventProducer
from ..services.orchestrator import Orchestrator
from ..storage.artifact_store import ArtifactStore, get_artifact_store


async def get_db() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        yield session


_idempotency_store: IdempotencyStore | None = None


def get_idempotency_store() -> IdempotencyStore:
    global _idempotency_store
    if _idempotency_store is None:
        _idempotency_store = IdempotencyStore()
    return _idempotency_store


def set_idempotency_store(store: IdempotencyStore) -> None:
    global _idempotency_store
    _idempotency_store = store


_producer: EventProducer | None = None


def set_producer(producer: EventProducer) -> None:
    global _producer
    _producer = producer


def get_producer_dep() -> EventProducer | None:
    return _producer


def get_orchestrator() -> Orchestrator:
    factory = get_session_factory()
    return Orchestrator(
        session_factory=factory,
        producer=_producer,
        artifact_store=get_artifact_store(),
    )


def get_store() -> ArtifactStore:
    return get_artifact_store()


def get_principal_dep(principal: Principal = Depends(get_principal)) -> Principal:
    return principal
