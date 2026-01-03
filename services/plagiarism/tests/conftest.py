"""Shared pytest fixtures: aiosqlite engine, fake redis, mock producer."""
from __future__ import annotations

import os
import sys
from collections.abc import AsyncIterator
from pathlib import Path

# Ensure src/ is importable when running pytest from repo root.
_HERE = Path(__file__).resolve()
_SRC = _HERE.parent.parent / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))

os.environ.setdefault("PLAGIARISM_ENV", "test")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("AUTH_REQUIRED", "false")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import event  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from plagiarism_service.api.deps import set_idempotency_store, set_producer  # noqa: E402
from plagiarism_service.common.idempotency import IdempotencyStore  # noqa: E402
from plagiarism_service.config import get_settings  # noqa: E402
from plagiarism_service.db import set_session_factory  # noqa: E402
from plagiarism_service.events.producer import NullEventProducer  # noqa: E402
from plagiarism_service.main import app  # noqa: E402
from plagiarism_service.models.base import Base  # noqa: E402

# ---------------------------------------------------------------------
# Make the module-level config reflect test mode.
# ---------------------------------------------------------------------
_settings = get_settings()
_settings.env = "test"
_settings.auth_required = False


@pytest_asyncio.fixture
async def engine():
    """SQLite-aiosqlite engine. We translate the Postgres-only ``plagiarism``
    schema into the default schema by overriding metadata.
    """
    # Strip the schema for SQLite by walking metadata and clearing schema=...
    for tbl in Base.metadata.tables.values():
        tbl.schema = None
    Base.metadata.schema = None

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)

    @event.listens_for(engine.sync_engine, "connect")
    def _enable_fk(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def session_factory(engine) -> async_sessionmaker[AsyncSession]:
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    set_session_factory(factory)
    return factory


@pytest_asyncio.fixture
async def db_session(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def fakeredis_store():
    import fakeredis.aioredis

    redis = fakeredis.aioredis.FakeRedis()
    store = IdempotencyStore(redis_client=redis)
    set_idempotency_store(store)
    yield store
    await redis.aclose()


@pytest.fixture
def producer() -> NullEventProducer:
    p = NullEventProducer()
    set_producer(p)
    return p


@pytest_asyncio.fixture
async def client(session_factory, fakeredis_store, producer) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


def admin_headers(tenant: str = "tnt_test", user: str = "usr_admin") -> dict[str, str]:
    return {
        "X-Dev-User": user,
        "X-Dev-Tenant": tenant,
        "X-Dev-Role": "admin",
    }


def teacher_headers(
    tenant: str = "tnt_test",
    user: str = "usr_teacher",
    course_id: str = "crs_test",
    course_role: str = "owner",
) -> dict[str, str]:
    return {
        "X-Dev-User": user,
        "X-Dev-Tenant": tenant,
        "X-Dev-Role": "teacher",
        "X-Dev-Course-Role": f"{course_id}:{course_role}",
    }


def student_headers(
    tenant: str = "tnt_test",
    user: str = "usr_student",
    course_id: str = "crs_test",
) -> dict[str, str]:
    return {
        "X-Dev-User": user,
        "X-Dev-Tenant": tenant,
        "X-Dev-Role": "student",
        "X-Dev-Course-Role": f"{course_id}:student",
    }
