"""Test fixtures: in-memory SQLite + ASGI client + auth bypass."""
from __future__ import annotations

import asyncio
import os
import sys
import warnings
from collections.abc import AsyncIterator
from pathlib import Path

# Configure env BEFORE any audit_service import.
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("AUTH_DISABLED", "true")
os.environ.setdefault("KAFKA_DISABLED", "true")
os.environ.setdefault("REDIS_DISABLED", "true")
os.environ.setdefault("SCHEDULER_DISABLED", "true")
os.environ.setdefault("RUN_BACKGROUND_JOBS", "false")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("INTERNAL_SERVICE_TOKEN", "test-internal-token")

# Make sure src/ is importable when tests are run from the service dir.
SRC = Path(__file__).resolve().parent.parent / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from audit_service import db as db_mod  # noqa: E402
from audit_service.config import get_settings, reset_settings_cache  # noqa: E402
from audit_service.main import create_app  # noqa: E402
from audit_service.models import Base  # noqa: E402

warnings.filterwarnings("ignore", category=DeprecationWarning)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture()
async def engine():
    reset_settings_cache()
    _ = get_settings()
    db_mod.reset_engine()
    # Use a single shared in-memory SQLite via a named URI, so ATTACH'd
    # databases can also reuse it. We attach an empty in-memory DB under
    # the alias ``audit`` so that schema-qualified DDL works without
    # PostgreSQL schemas.
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"uri": False},
    )
    # Attach a separate in-memory DB as schema "audit" (per-connection).
    from sqlalchemy import event

    @event.listens_for(eng.sync_engine, "connect")
    def _attach_audit(dbapi_conn, _record):
        cur = dbapi_conn.cursor()
        cur.execute("ATTACH DATABASE ':memory:' AS audit")
        cur.close()

    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture()
async def session_factory(engine):
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


@pytest_asyncio.fixture()
async def app(engine, session_factory, monkeypatch):
    # Wire the global db module to use the test engine.
    db_mod._engine = engine  # type: ignore[attr-defined]
    db_mod._session_factory = session_factory  # type: ignore[attr-defined]
    application = create_app()
    yield application
    db_mod.reset_engine()


@pytest_asyncio.fixture()
async def client(app) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
