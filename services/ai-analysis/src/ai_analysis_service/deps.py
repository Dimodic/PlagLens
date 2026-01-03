"""FastAPI dependency providers."""
from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .common.auth import Principal, get_principal
from .common.idempotency import IdempotencyStore
from .common.problem import ProblemException
from .common.redis_client import get_client
from .config import Settings, get_settings
from .db import get_session as _db_session
from .events.producer import EventPublisher, get_publisher
from .services.cache import AnalysisCache
from .services.orchestrator import Orchestrator, ProviderFactory
from .services.prompt_loader import PromptLoader
from .services.submission_client import SubmissionClient


async def get_session() -> AsyncIterator[AsyncSession]:
    async for s in _db_session():
        yield s


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
PrincipalDep = Annotated[Principal, Depends(get_principal)]


def get_redis() -> object | None:
    return get_client()


RedisDep = Annotated[object | None, Depends(get_redis)]


def get_cache(redis=Depends(get_redis)) -> AnalysisCache:
    return AnalysisCache(redis)


CacheDep = Annotated[AnalysisCache, Depends(get_cache)]


def get_idempotency_store(redis=Depends(get_redis)) -> IdempotencyStore:
    return IdempotencyStore(redis)


IdempotencyDep = Annotated[IdempotencyStore, Depends(get_idempotency_store)]
PublisherDep = Annotated[EventPublisher, Depends(get_publisher)]


_provider_factory: ProviderFactory | None = None


def get_provider_factory() -> ProviderFactory:
    global _provider_factory
    if _provider_factory is None:
        _provider_factory = ProviderFactory()
    return _provider_factory


def set_provider_factory(factory: ProviderFactory) -> None:
    global _provider_factory
    _provider_factory = factory


ProviderFactoryDep = Annotated[ProviderFactory, Depends(get_provider_factory)]


def get_prompt_loader() -> PromptLoader:
    return PromptLoader()


PromptLoaderDep = Annotated[PromptLoader, Depends(get_prompt_loader)]


def get_orchestrator(
    session: SessionDep,
    cache: CacheDep,
    publisher: PublisherDep,
    factory: ProviderFactoryDep,
    loader: PromptLoaderDep,
) -> Orchestrator:
    return Orchestrator(
        session=session,
        cache=cache,
        publisher=publisher,
        provider_factory=factory,
        prompt_loader=loader,
    )


OrchestratorDep = Annotated[Orchestrator, Depends(get_orchestrator)]


_submission_client: SubmissionClient | None = None


def get_submission_client() -> SubmissionClient:
    global _submission_client
    if _submission_client is None:
        _submission_client = SubmissionClient()
    return _submission_client


def set_submission_client(client: SubmissionClient) -> None:
    global _submission_client
    _submission_client = client


SubmissionClientDep = Annotated[SubmissionClient, Depends(get_submission_client)]


async def idempotency_key(
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str | None:
    return idempotency_key


IdempotencyKeyDep = Annotated[str | None, Depends(idempotency_key)]


def request_id(request: Request) -> str | None:
    return getattr(request.state, "request_id", None)


def parse_principal_or_403(p: Principal) -> Principal:
    if not p.user_id or not p.tenant_id:
        raise ProblemException(
            status_code=401,
            code="UNAUTHENTICATED",
            title="Unauthenticated",
            detail="missing principal",
        )
    return p
