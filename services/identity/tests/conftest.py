"""Pytest fixtures: aiosqlite DB, fake Redis, stub Kafka, FastAPI test client.

We force ``SQLITE_TESTS=1`` so the SQLAlchemy models drop the ``identity`` schema
qualifier (PG-only) and use plain SQLite-friendly types.
"""
from __future__ import annotations

import os
import sys

# Must be set BEFORE we import the package so models bind to the no-schema metadata.
os.environ["SQLITE_TESTS"] = "1"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["ENVIRONMENT"] = "test"
os.environ["KAFKA_BROKERS"] = ""
os.environ["JWT_PRIVATE_KEY_PATH"] = "tests/.keys/jwt-private.pem"
os.environ["JWT_PUBLIC_KEY_PATH"] = "tests/.keys/jwt-public.pem"

from collections.abc import AsyncIterator  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# Ensure ``src`` is on path for editable-install-free runs.
_HERE = os.path.dirname(os.path.abspath(__file__))
_SRC = os.path.normpath(os.path.join(_HERE, "..", "src"))
if _SRC not in sys.path:
    sys.path.insert(0, _SRC)


from identity_service import db as db_module  # noqa: E402
from identity_service.common import events as events_module  # noqa: E402
from identity_service.common.events import StubProducer  # noqa: E402
from identity_service.common.security import (  # noqa: E402
    hash_password,
    issue_access_token,
)
from identity_service.deps import get_session as get_session_dep  # noqa: E402
from identity_service.main import app as fastapi_app  # noqa: E402
from identity_service.models import Base, Tenant, User  # noqa: E402


# --------------------------------------------------------------------------- #
# In-memory fake redis
# --------------------------------------------------------------------------- #
class FakeRedis:
    """Tiny subset of redis-py async API used by the service."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self._store[key] = value

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None


# --------------------------------------------------------------------------- #
# DB engine + schema bootstrapping
# --------------------------------------------------------------------------- #
@pytest_asyncio.fixture(scope="function")
async def engine():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:", future=True
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture(scope="function")
async def session_factory(engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


@pytest_asyncio.fixture(scope="function")
async def db_session(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as s:
        yield s
        await s.rollback()


# --------------------------------------------------------------------------- #
# Seed data
# --------------------------------------------------------------------------- #
@pytest_asyncio.fixture(scope="function")
async def seed_tenant(session_factory) -> Tenant:
    async with session_factory() as s:
        t = Tenant(id="tnt_test", slug="hse", name="HSE", status="active")
        s.add(t)
        await s.commit()
        await s.refresh(t)
        return t


@pytest_asyncio.fixture(scope="function")
async def seed_user(session_factory, seed_tenant) -> User:
    async with session_factory() as s:
        u = User(
            id="usr_admin",
            tenant_id=seed_tenant.id,
            email="admin@hse.ru",
            password_hash=hash_password("p4ssword!"),
            display_name="Admin",
            global_role="admin",
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


@pytest_asyncio.fixture(scope="function")
async def seed_super_admin(session_factory, seed_tenant) -> User:
    async with session_factory() as s:
        u = User(
            id="usr_sa",
            tenant_id=seed_tenant.id,
            email="sa@plaglens.local",
            password_hash=hash_password("p4ssword!"),
            display_name="SA",
            global_role="super_admin",
        )
        s.add(u)
        await s.commit()
        await s.refresh(u)
        return u


# --------------------------------------------------------------------------- #
# FastAPI app with overridden dependencies
# --------------------------------------------------------------------------- #
@pytest_asyncio.fixture(scope="function")
async def app(session_factory, monkeypatch) -> Any:
    """Bind ``app.state.redis`` + producer + DB session to test fixtures."""

    fastapi_app.state.redis = FakeRedis()
    fastapi_app.state.producer = StubProducer()
    fastapi_app.state.engine = None  # not used directly by test

    # Override the SessionLocal factory used by ``session_dep``.
    monkeypatch.setattr(db_module, "_session_factory", session_factory)
    monkeypatch.setattr(db_module, "_engine", session_factory.kw["bind"])  # type: ignore[index]

    async def _override_get_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as s:
            try:
                yield s
                await s.commit()
            except Exception:
                await s.rollback()
                raise

    fastapi_app.dependency_overrides[get_session_dep] = _override_get_session

    # Avoid producer accidentally trying real Kafka
    monkeypatch.setattr(
        events_module, "KafkaProducer", lambda *a, **k: StubProducer()
    )

    yield fastapi_app

    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #
def auth_header(*, user_id: str, tenant_id: str, role: str = "admin") -> dict[str, str]:
    token = issue_access_token(
        user_id=user_id, tenant_id=tenant_id, global_role=role
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_admin(seed_user):
    return auth_header(user_id=seed_user.id, tenant_id=seed_user.tenant_id, role="admin")


@pytest.fixture
def auth_super_admin(seed_super_admin):
    return auth_header(
        user_id=seed_super_admin.id,
        tenant_id=seed_super_admin.tenant_id,
        role="super_admin",
    )
