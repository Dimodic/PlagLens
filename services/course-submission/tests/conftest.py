"""Test fixtures for the merged service.

In-memory aiosqlite DB built directly from the course ORM metadata (no
Alembic). ``COURSE_DB_SCHEMA=`` (empty) is set before importing models so all
tables live in SQLite's default schema.
"""

from __future__ import annotations

import os

os.environ.setdefault("COURSE_DB_SCHEMA", "")
os.environ.setdefault("SUBMISSION_DB_SCHEMA", "")
os.environ.setdefault("SQLITE_TESTS", "1")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("KAFKA_ENABLED", "false")
os.environ.setdefault("KAFKA_DISABLED", "true")
os.environ.setdefault("REDIS_ENABLED", "false")
os.environ.setdefault("JWT_HS_SECRET", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from course_service.models import Base


@pytest_asyncio.fixture
async def engine():
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
    return async_sessionmaker(engine, expire_on_commit=False)
