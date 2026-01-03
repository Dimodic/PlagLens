"""Shared FastAPI dependencies (DB session, redis, services)."""
from __future__ import annotations

from typing import AsyncIterator

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    sm = request.app.state.session_maker
    async with sm() as session:
        yield session


def get_redis(request: Request):
    return request.app.state.redis


def get_storage(request: Request):
    return request.app.state.storage


def get_kafka(request: Request):
    return request.app.state.kafka


def get_idem(request: Request):
    return request.app.state.idempotency


def get_settings_dep(request: Request):
    return request.app.state.settings


def get_scheduler(request: Request):
    return request.app.state.scheduler


def get_audit_proxy(request: Request):
    return request.app.state.audit_proxy


# Re-export to be importable as `Depends(...)` arguments
__all__ = [
    "get_session",
    "get_redis",
    "get_storage",
    "get_kafka",
    "get_idem",
    "get_settings_dep",
    "get_scheduler",
    "get_audit_proxy",
    "Depends",
]
