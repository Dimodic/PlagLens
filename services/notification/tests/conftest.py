"""Test fixtures: aiosqlite engine, fakeredis, app w/ overrides."""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import fakeredis.aioredis as fakeredis_aio
import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from notification_service import config as cfg_mod
from notification_service import db as db_mod
from notification_service import redis_bus as redis_mod
from notification_service.channels.base import Channel, DeliveryRequest, DeliveryResult
from notification_service.delivery import close_channels, init_channels
from notification_service.main import create_app
from notification_service.models import Base


def _set_env_for_tests() -> None:
    cfg_mod.reset_settings_cache()


class CapturingChannel(Channel):
    def __init__(self, name: str) -> None:
        self.name = name
        self.calls: list[DeliveryRequest] = []

    async def send(self, req: DeliveryRequest) -> DeliveryResult:
        self.calls.append(req)
        return DeliveryResult(status="sent")


@pytest_asyncio.fixture(autouse=True)
async def _setup_db(monkeypatch) -> AsyncIterator[None]:
    monkeypatch.setenv("AUTH_DISABLED", "1")
    monkeypatch.setenv("KAFKA_DISABLED", "1")
    monkeypatch.setenv("REDIS_DISABLED", "1")
    monkeypatch.setenv("SCHEDULER_DISABLED", "1")
    monkeypatch.setenv("TELEGRAM_DISABLED", "1")
    cfg_mod.reset_settings_cache()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)

    @event.listens_for(engine.sync_engine, "connect")
    def _attach_schema(dbapi_conn, _conn_record):
        # Map a schema name "notification" to main DB so f"{SCHEMA}.table" works.
        cur = dbapi_conn.cursor()
        cur.execute("ATTACH DATABASE ':memory:' AS notification")
        cur.close()

    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    db_mod.set_session_factory(factory)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _setup_redis() -> AsyncIterator[None]:
    fr = fakeredis_aio.FakeRedis(decode_responses=True)
    redis_mod.set_redis_client(fr)
    yield
    try:
        await fr.aclose()
    except Exception:
        pass


@pytest_asyncio.fixture()
async def captures() -> AsyncIterator[dict[str, CapturingChannel]]:
    inapp = CapturingChannel("inapp")
    email = CapturingChannel("email")
    tg = CapturingChannel("telegram")
    init_channels(inapp=inapp, email=email, telegram=tg)
    try:
        yield {"inapp": inapp, "email": email, "telegram": tg}
    finally:
        await close_channels()


@pytest_asyncio.fixture()
async def app(captures):  # noqa: ARG001
    application = create_app()
    return application


@pytest_asyncio.fixture()
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture()
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


__all__ = ["TestClient"]
