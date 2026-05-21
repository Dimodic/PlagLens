"""Shared pytest fixtures: SQLite-backed engine, FastAPI client, in-memory
storage + course client, in-memory Kafka publisher, fake idempotency store.
"""
from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

os.environ.setdefault("AUTH_DISABLED", "true")
os.environ.setdefault("KAFKA_DISABLED", "true")
os.environ.setdefault("MINIO_DISABLED", "true")

from submission_service import db as db_module
from submission_service.api import deps as api_deps
from submission_service.events.producer import reset_publisher
from submission_service.main import create_app
from submission_service.models import Base
from submission_service.services.course_client import (
    AssignmentInfo,
    InMemoryCourseClient,
)
from submission_service.services.file_storage_service import InMemoryFileStorage


@pytest_asyncio.fixture
async def engine() -> AsyncIterator[Any]:
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:", future=True, echo=False
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session_factory(engine: Any) -> async_sessionmaker[AsyncSession]:
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    db_module.set_session_factory(factory)
    return factory


@pytest_asyncio.fixture
async def session(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with session_factory() as s:
        yield s


@pytest.fixture
def storage() -> InMemoryFileStorage:
    s = InMemoryFileStorage(prefix="plaglens")
    api_deps.set_storage(s)
    return s


@pytest.fixture
def course_client() -> InMemoryCourseClient:
    c = InMemoryCourseClient()
    c.seed(
        AssignmentInfo(
            id="asg_1",
            course_id="crs_1",
            tenant_id="tnt_a",
            deadline_soft_at=datetime.now(UTC) + timedelta(days=7),
            deadline_hard_at=datetime.now(UTC) + timedelta(days=14),
            late_score_multiplier=0.5,
            selection_strategy="last",
            max_score=10.0,
        )
    )
    c.seed(
        AssignmentInfo(
            id="asg_late_soft",
            course_id="crs_1",
            tenant_id="tnt_a",
            deadline_soft_at=datetime.now(UTC) - timedelta(days=1),
            deadline_hard_at=datetime.now(UTC) + timedelta(days=7),
            late_score_multiplier=0.5,
            selection_strategy="last",
            max_score=10.0,
        )
    )
    c.seed(
        AssignmentInfo(
            id="asg_late_hard",
            course_id="crs_1",
            tenant_id="tnt_a",
            deadline_soft_at=datetime.now(UTC) - timedelta(days=14),
            deadline_hard_at=datetime.now(UTC) - timedelta(days=1),
            late_score_multiplier=0.5,
            selection_strategy="last",
            max_score=10.0,
        )
    )
    api_deps.set_course_client(c)
    return c


@pytest_asyncio.fixture
async def app(
    session_factory: async_sessionmaker[AsyncSession],
    storage: InMemoryFileStorage,
    course_client: InMemoryCourseClient,
):
    reset_publisher()
    application = create_app()
    yield application
    reset_publisher()


@pytest_asyncio.fixture
async def client(app: Any) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c


def auth_header(
    *,
    user_id: str = "usr_teach",
    tenant_id: str = "tnt_a",
    global_role: str = "teacher",
    course_roles: dict[str, str] | None = None,
) -> dict[str, str]:
    payload = {
        "user_id": user_id,
        "tenant_id": tenant_id,
        "global_role": global_role,
        "course_roles": course_roles or {"crs_1": "owner"},
    }
    return {"X-Test-User": json.dumps(payload), "Authorization": "Bearer test"}


@pytest.fixture
def teacher_headers() -> dict[str, str]:
    return auth_header()


@pytest.fixture
def student_headers() -> dict[str, str]:
    return auth_header(
        user_id="usr_stu_1",
        global_role="student",
        course_roles={"crs_1": "student"},
    )


@pytest.fixture
def other_student_headers() -> dict[str, str]:
    return auth_header(
        user_id="usr_stu_2",
        global_role="student",
        course_roles={"crs_1": "student"},
    )


@pytest.fixture
def assistant_headers() -> dict[str, str]:
    return auth_header(
        user_id="usr_asst",
        global_role="teacher",
        course_roles={"crs_1": "assistant"},
    )
