"""Database engine + session factory + dependency."""
from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from notification_service.config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_engine(url: str | None = None) -> AsyncEngine:
    global _engine, _session_factory
    settings = get_settings()
    db_url = url or settings.DATABASE_URL
    _engine = create_async_engine(db_url, future=True, pool_pre_ping=True)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False, class_=AsyncSession)
    return _engine


def get_engine() -> AsyncEngine:
    if _engine is None:
        init_engine()
    assert _engine is not None
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    return _session_factory


def set_session_factory(factory: async_sessionmaker[AsyncSession]) -> None:
    """Inject an external session factory (for tests)."""
    global _session_factory
    _session_factory = factory


async def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
