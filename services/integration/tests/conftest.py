"""Shared fixtures: in-memory SQLite + fakeredis + isolated kafka bus."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from typing import AsyncIterator

# Ensure local ``src`` and ``tests`` packages take priority over any pre-existing
# install of ``plaglens-integration-service``.
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
for p in (SRC, ROOT):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

# Force a sqlite + fake redis backend for tests before settings are imported.
os.environ.setdefault(
    "DATABASE_URL", "sqlite+aiosqlite:///:memory:?cache=shared"
)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("ENABLE_KAFKA", "false")
os.environ.setdefault("ENABLE_SCHEDULER", "false")
os.environ.setdefault("ENABLE_TELEGRAM_BOT", "false")
os.environ.setdefault("STEPIK_OAUTH_CLIENT_ID", "stepik-test-id")
os.environ.setdefault("STEPIK_OAUTH_CLIENT_SECRET", "stepik-test-secret")
os.environ.setdefault("YANDEX_CONTEST_OAUTH_CLIENT_ID", "yc-test-id")
os.environ.setdefault("YANDEX_CONTEST_OAUTH_CLIENT_SECRET", "yc-test-secret")
os.environ.setdefault("DB_SCHEMA", "main")  # sqlite has no real schemas
os.environ.setdefault("WEBHOOK_SECRET_STEPIK", "stepik-test-secret-shared")
os.environ.setdefault("WEBHOOK_SECRET_PLAGIARISM", "plagiarism-test-secret")

import pytest  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

import integration_service.common.db as db_mod  # noqa: E402
import integration_service.common.redis_client as redis_mod  # noqa: E402
from integration_service.common.kafka_bus import KafkaBus, reset_bus_for_tests  # noqa: E402
from integration_service.config import get_settings  # noqa: E402
from integration_service.models import Base  # noqa: E402

# Ensure SQLAlchemy doesn't try to apply a real schema to sqlite tables.
Base.metadata.schema = None
for table in Base.metadata.tables.values():
    table.schema = None


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest.fixture
async def db_session(engine, monkeypatch) -> AsyncIterator:
    sm = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(db_mod, "_engine", engine, raising=False)
    monkeypatch.setattr(db_mod, "_sessionmaker", sm, raising=False)
    async with sm() as session:
        yield session


@pytest.fixture
async def fake_redis(monkeypatch):
    try:
        import fakeredis.aioredis as fakeredis_async
    except ImportError:  # pragma: no cover
        try:
            from fakeredis import aioredis as fakeredis_async  # type: ignore
        except Exception as exc:  # pragma: no cover
            pytest.skip(f"fakeredis not installed: {exc}")
    client = fakeredis_async.FakeRedis(decode_responses=True)
    monkeypatch.setattr(redis_mod, "_client", client, raising=False)
    yield client
    try:
        await client.aclose()
    except Exception:
        pass


@pytest.fixture
async def bus(monkeypatch):
    bus = KafkaBus()
    import integration_service.common.kafka_bus as kbus
    monkeypatch.setattr(kbus, "_bus", bus, raising=False)
    await bus.start()  # no-op when kafka disabled
    yield bus
    await reset_bus_for_tests()


@pytest.fixture
async def app(engine, db_session, fake_redis, bus, monkeypatch):
    """Build a FastAPI test application with overridden dependencies."""
    from integration_service.common.auth import Principal
    from integration_service.deps import bus_dep, principal_dep, session_dep

    sm = async_sessionmaker(engine, expire_on_commit=False)
    monkeypatch.setattr(db_mod, "_engine", engine, raising=False)
    monkeypatch.setattr(db_mod, "_sessionmaker", sm, raising=False)

    from integration_service.main import create_app

    application = create_app()

    async def _override_session() -> AsyncIterator:
        async with sm() as session:
            try:
                yield session
            finally:
                await session.close()

    def _override_bus() -> KafkaBus:
        return bus

    async def _principal(
        x_user_id: str | None = None,
        x_tenant_id: str | None = None,
        x_global_role: str | None = "admin",
        x_course_role: str | None = None,
        x_course_id: str | None = None,
    ) -> Principal:
        course_roles: dict[str, str] = {}
        if x_course_id and x_course_role:
            course_roles[x_course_id] = x_course_role
        return Principal(
            user_id=x_user_id or "usr_test",
            tenant_id=x_tenant_id or "tnt_test",
            global_role=x_global_role or "admin",
            course_roles=course_roles,
        )

    application.dependency_overrides[session_dep] = _override_session
    application.dependency_overrides[bus_dep] = _override_bus
    application.dependency_overrides[principal_dep] = _principal
    yield application
    application.dependency_overrides.clear()


@pytest.fixture
async def client(app):
    from httpx import ASGITransport, AsyncClient

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def settings():
    return get_settings()
