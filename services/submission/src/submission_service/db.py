"""SQLAlchemy async engine + session factory."""
from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_engine() -> None:
    global _engine, _session_factory
    settings = get_settings()
    _engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        future=True,
    )
    _session_factory = async_sessionmaker(
        _engine,
        expire_on_commit=False,
        class_=AsyncSession,
    )


def reset_engine() -> None:
    """Tests may call this to clear the cached engine/factory."""
    global _engine, _session_factory
    _engine = None
    _session_factory = None


def set_session_factory(factory: async_sessionmaker[AsyncSession]) -> None:
    """Tests inject their own factory bound to a custom engine."""
    global _session_factory
    _session_factory = factory


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        _build_engine()
    assert _session_factory is not None
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
