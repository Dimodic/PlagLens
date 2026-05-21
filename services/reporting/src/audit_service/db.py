"""Async SQLAlchemy engine + session factory."""
from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings


def make_engine(url: str | None = None):
    return create_async_engine(
        url or settings.database_url,
        pool_pre_ping=True,
        future=True,
    )


_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine():
    global _engine, _session_factory
    if _engine is None:
        _engine = make_engine()
        _session_factory = async_sessionmaker(
            _engine, expire_on_commit=False, autoflush=False
        )
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        get_engine()
    assert _session_factory is not None
    return _session_factory


def reset_engine() -> None:
    """For tests: discard the cached engine."""
    global _engine, _session_factory
    _engine = None
    _session_factory = None


async def session_dep() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
