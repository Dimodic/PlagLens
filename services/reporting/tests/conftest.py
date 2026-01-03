"""Test fixtures: aiosqlite DB, fakeredis, mock Kafka, mock MinIO, mock Google Sheets."""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Force a schema-less metadata for tests BEFORE the app's models are loaded.
# This is the only way to test schema-qualified models on SQLite, which has no
# native CREATE SCHEMA. We rebuild Base.metadata in place: schema=None on the
# MetaData object and on every table; FK colspecs lose their "reporting." prefix.
import reporting_service.models.base as base_mod  # noqa: E402

base_mod.Base.metadata.schema = None
import reporting_service.models  # noqa: E402,F401  -- triggers table import

# Now strip schema from each table that was already registered.
for _t in list(base_mod.Base.metadata.tables.values()):
    _t.schema = None
    for _fk in list(_t.foreign_keys):
        _spec = _fk._colspec
        if isinstance(_spec, str) and _spec.startswith("reporting."):
            _fk._colspec = _spec.split(".", 1)[1]

from reporting_service.common.idempotency import IdempotencyStore  # noqa: E402
from reporting_service.common.rbac import Principal  # noqa: E402
from reporting_service.events.consumer import EventConsumer  # noqa: E402
from reporting_service.events.producer import EventProducer  # noqa: E402
from reporting_service.exports.formats.google_sheets import (  # noqa: E402
    InMemoryGoogleSheetsClient,
)
from reporting_service.read_models.handlers import build_handler_registry  # noqa: E402
from reporting_service.scheduling.scheduler import ReportingScheduler  # noqa: E402
from reporting_service.services.audit_proxy import InMemoryAuditProxy  # noqa: E402
from reporting_service.services.export_service import ExportService  # noqa: E402
from reporting_service.storage import InMemoryStorage  # noqa: E402


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:", future=True)
    async with eng.begin() as conn:
        await conn.run_sync(base_mod.Base.metadata.create_all)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def session_maker(engine) -> async_sessionmaker:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest_asyncio.fixture
async def session(session_maker) -> AsyncIterator[AsyncSession]:
    async with session_maker() as s:
        yield s


@pytest_asyncio.fixture
async def fake_redis():
    try:
        import fakeredis.aioredis as fakeredis_mod
        client = fakeredis_mod.FakeRedis(decode_responses=True)
    except Exception:
        # Final fallback used in main: a tiny in-memory replacement.
        from reporting_service.main import _MemoryRedis
        client = _MemoryRedis()
    yield client


@pytest_asyncio.fixture
async def storage():
    return InMemoryStorage()


@pytest_asyncio.fixture
async def producer():
    p = EventProducer(bootstrap=None)
    await p.start()
    yield p
    await p.stop()


@pytest_asyncio.fixture
async def sheets_client():
    return InMemoryGoogleSheetsClient()


@pytest_asyncio.fixture
async def audit_proxy():
    return InMemoryAuditProxy()


@pytest_asyncio.fixture
async def settings():
    from reporting_service.config import Settings

    return Settings(
        database_url="sqlite+aiosqlite:///:memory:",
        redis_url="redis://localhost:6379/2",
        kafka_bootstrap="",
        minio_endpoint="memory",
        audit_service_base_url="memory",
    )


@pytest_asyncio.fixture
async def export_service(session_maker, storage, producer, sheets_client, settings):
    return ExportService(
        session_maker=session_maker,
        storage=storage,
        producer=producer,
        sheets_client=sheets_client,
        settings=settings,
    )


@pytest_asyncio.fixture
async def consumer(session_maker):
    return EventConsumer(session_maker, build_handler_registry())


@pytest_asyncio.fixture
async def scheduler(session_maker):
    async def _fake_run_export(*args, **kwargs):
        return "exp_test"

    sched = ReportingScheduler(session_maker, run_export=_fake_run_export)
    yield sched


@pytest_asyncio.fixture
async def app(
    session_maker,
    fake_redis,
    storage,
    producer,
    sheets_client,
    settings,
    consumer,
    scheduler,
    audit_proxy,
    export_service,
) -> FastAPI:
    """Build a FastAPI app pre-wired with test doubles, bypassing the lifespan."""
    application = FastAPI(title="reporting-test")
    from reporting_service.api.v1 import build_v1_router
    from reporting_service.common.middleware import (
        RequestIdMiddleware,
        install_exception_handlers,
    )

    application.add_middleware(RequestIdMiddleware)
    install_exception_handlers(application)
    application.include_router(build_v1_router())

    application.state.settings = settings
    application.state.session_maker = session_maker
    application.state.redis = fake_redis
    application.state.storage = storage
    application.state.kafka = producer
    application.state.consumer = consumer
    application.state.export_service = export_service
    application.state.sheets_client = sheets_client
    application.state.idempotency = IdempotencyStore(
        fake_redis, namespace=f"{settings.redis_prefix}:idem"
    )
    application.state.scheduler = scheduler
    application.state.audit_proxy = audit_proxy
    return application


def _make_principal(role: str = "teacher", course_role: str | None = "owner") -> Principal:
    return Principal(
        user_id="user-1",
        tenant_id="tenant-1",
        global_role=role,
        course_roles={"course-1": course_role} if course_role else {},
    )


@pytest_asyncio.fixture
async def teacher_principal():
    return _make_principal("teacher", "owner")


@pytest_asyncio.fixture
async def admin_principal():
    return _make_principal("admin", None)


@pytest_asyncio.fixture
async def super_admin_principal():
    return _make_principal("super_admin", None)


@pytest_asyncio.fixture
async def student_principal():
    return _make_principal("student", "student")


@pytest_asyncio.fixture
async def client_factory(app):
    """Returns a callable: (principal) -> AsyncClient pre-authenticated."""

    def _factory(principal: Principal):
        app.state.test_principal = principal
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")

    return _factory
