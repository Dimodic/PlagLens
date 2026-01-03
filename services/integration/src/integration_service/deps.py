"""FastAPI dependency providers for the integration service."""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.auth import Principal, get_principal
from integration_service.common.db import get_session
from integration_service.common.kafka_bus import KafkaBus, get_bus


async def session_dep() -> AsyncIterator[AsyncSession]:
    async for s in get_session():
        yield s


def bus_dep() -> KafkaBus:
    return get_bus()


def principal_dep(p: Principal = Depends(get_principal)) -> Principal:
    return p
