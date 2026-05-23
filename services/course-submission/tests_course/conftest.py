"""Test fixtures.

The course service is tested against an in-memory ``aiosqlite`` DB. We do
**not** rely on Alembic migrations for the test schema (the upgrade script
contains a CREATE SCHEMA + JSONB types that SQLite does not understand);
instead we let SQLAlchemy create the schema directly from the ORM
metadata.

A single ``COURSE_DB_SCHEMA=`` (empty) is set before importing the app so
all tables live in SQLite's default schema.
"""

from __future__ import annotations

import os

# Ensure tests run with no Postgres-only schema before any models are imported.
os.environ.setdefault("COURSE_DB_SCHEMA", "")

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from course_service import deps as deps_module
from course_service.common.events import KafkaProducer
from course_service.common.redis_client import RedisClient
from course_service.config import Settings, get_settings
from course_service.events.producer import CourseEventPublisher
from course_service.main import create_app
from course_service.models import Base, Course, CourseMember, CourseOwner

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("REDIS_ENABLED", "false")
    monkeypatch.setenv("KAFKA_ENABLED", "false")
    monkeypatch.setenv("JWT_HS_SECRET", "test-secret")
    monkeypatch.setenv("JWT_ALGORITHM", "HS256")
    get_settings.cache_clear()
    return get_settings()


@pytest_asyncio.fixture
async def engine(settings: Settings):
    # Per-test in-memory DB. We use ``StaticPool`` so all sessions inside a
    # single test share the same in-memory connection (otherwise each new
    # connection sees an empty DB).
    from sqlalchemy.pool import StaticPool

    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield eng
    finally:
        await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine):
    factory = async_sessionmaker(engine, expire_on_commit=False)
    deps_module.configure_session_factory(factory)
    yield factory


@pytest_asyncio.fixture
async def session(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as s:
        yield s
        await s.rollback()


@pytest_asyncio.fixture
async def app(settings: Settings, session_factory):
    """Build the FastAPI app and wire test fakes manually.

    We bypass the production lifespan so the test does not need a real
    Redis / Kafka. The lifecycle objects (publisher, redis, consumer) are
    attached to ``app.state`` directly.
    """
    app = create_app(settings)
    producer = KafkaProducer(settings.kafka_brokers, enabled=False)
    publisher = CourseEventPublisher(producer, settings)
    redis = RedisClient(settings.redis_url, enabled=False)
    app.state.settings = settings
    app.state.session_factory = session_factory
    app.state.kafka_producer = producer
    app.state.publisher = publisher
    app.state.redis = redis

    # Wire DI: replace get_publisher() with our test-fake so events go through
    # the same publisher that tests inspect via app.state.kafka_producer.
    from course_service.api import _helpers as helpers_module

    helpers_module.configure_publisher(publisher)
    yield app
    helpers_module.reset_publisher()


def make_token(
    *,
    user_id: str = "usr_owner",
    tenant_id: str = "tnt_test",
    global_role: str = "teacher",
    course_roles: dict[str, str] | None = None,
    secret: str = "test-secret",
) -> str:
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "global_role": global_role,
        "course_roles": course_roles or {},
        "exp": int((datetime.now(tz=UTC) + timedelta(hours=1)).timestamp()),
        "iat": int(datetime.now(tz=UTC).timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest_asyncio.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


def auth_headers(**kwargs: Any) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(**kwargs)}"}


@pytest_asyncio.fixture
async def teacher_headers() -> dict[str, str]:
    return auth_headers(user_id="usr_owner", global_role="teacher")


@pytest_asyncio.fixture
async def student_headers() -> dict[str, str]:
    return auth_headers(user_id="usr_student", global_role="student")


@pytest_asyncio.fixture
async def admin_headers() -> dict[str, str]:
    return auth_headers(user_id="usr_admin", global_role="admin")


# Helper: create a course directly via DB, returning the course id.
@pytest_asyncio.fixture
async def make_course(session_factory):
    async def _factory(
        *,
        slug: str = "course-1",
        name: str = "Course 1",
        owner_id: str = "usr_owner",
        tenant_id: str = "tnt_test",
        status: str = "active",
    ) -> Course:
        async with session_factory() as s:
            c = Course(
                tenant_id=tenant_id,
                slug=slug,
                name=name,
                status=status,
                owner_id=owner_id,
                settings={},
            )
            s.add(c)
            await s.flush()
            s.add(CourseOwner(course_id=c.id, user_id=owner_id, role="owner"))
            await s.commit()
            await s.refresh(c)
            return c

    return _factory


@pytest_asyncio.fixture
async def add_member(session_factory):
    async def _add(course_id: int, user_id: str, role: str = "student") -> CourseMember:
        async with session_factory() as s:
            m = CourseMember(course_id=course_id, user_id=user_id, role=role)
            s.add(m)
            await s.commit()
            await s.refresh(m)
            return m

    return _add
