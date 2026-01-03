"""Shared pytest fixtures.

Wires the FastAPI app to:
- aiosqlite (in-memory db, schema=NULL since SQLite doesn't support schemas)
- fakeredis (replaces real Redis client)
- a fake EventPublisher (replaces aiokafka)
- a stub OpenAI client (replaces real network calls)
"""
from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Iterator
from typing import Any

import fakeredis.aioredis as fake_aioredis
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

# Force AUTH_DISABLED + KAFKA_DISABLED for tests BEFORE settings cache is built.
os.environ.setdefault("AUTH_DISABLED", "true")
os.environ.setdefault("KAFKA_DISABLED", "true")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_SCHEMA", "")  # SQLite has no schemas

from ai_analysis_service import db as db_module  # noqa: E402
from ai_analysis_service.common import redis_client as redis_module  # noqa: E402
from ai_analysis_service.config import get_settings  # noqa: E402
from ai_analysis_service.deps import set_provider_factory, set_submission_client  # noqa: E402
from ai_analysis_service.events import producer as producer_mod  # noqa: E402
from ai_analysis_service.main import create_app  # noqa: E402
from ai_analysis_service.models import Base  # noqa: E402

# ---------------------------------------------------------------------------
# Module-level event-loop / asyncio config
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def event_loop() -> Iterator[asyncio.AbstractEventLoop]:
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# DB / Redis / publisher fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
async def session_factory() -> AsyncIterator[Any]:
    """Provide a fresh in-memory SQLite db + factory for every test."""
    _ = get_settings()
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        future=True,
    )
    async with engine.begin() as conn:
        # SQLite: drop schema metadata since it can't honour it.
        for table in Base.metadata.tables.values():
            table.schema = None
        await conn.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)
    db_module.set_session_factory(factory)
    try:
        yield factory
    finally:
        await engine.dispose()
        # The session factory is reset automatically on the next test by
        # set_session_factory() — leave _session_factory pointing to the just-disposed
        # engine so a stray import doesn't reuse it. Tests that need a new one
        # simply request the fixture again.


@pytest.fixture()
async def redis_client() -> AsyncIterator[Any]:
    client = fake_aioredis.FakeRedis(decode_responses=True)
    redis_module.set_client(client)
    try:
        yield client
    finally:
        await client.aclose()
        redis_module.reset_client()


@pytest.fixture()
def fake_publisher() -> Iterator[Any]:
    pub = producer_mod.EventPublisher()
    pub._started = True
    producer_mod._publisher = pub
    yield pub
    producer_mod._publisher = None


# ---------------------------------------------------------------------------
# Provider factory stub (no real network calls)
# ---------------------------------------------------------------------------


class _StubReport:
    summary = "Looks straightforward; minor style points."
    risk_signals: list[Any] = []
    questions = ["Why did you pick this approach?"]
    recommendations = ["Add docstrings."]
    metadata = {"language": "python"}


class StubProvider:
    """Mimics OpenAICompatibleProvider.analyze without any HTTP."""

    def __init__(self, *, name: str, model: str, fail_with: Exception | None = None) -> None:
        self.name = name
        self.model = model
        self._fail = fail_with

    async def analyze(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any],
        prompt_version: str,
    ) -> Any:
        from decimal import Decimal

        from ai_analysis_service.providers.base import (
            AnalysisResult,
            TokenUsage,
        )
        from ai_analysis_service.schemas import PlagLensReport

        if self._fail is not None:
            raise self._fail
        report = PlagLensReport(
            summary="Solid solution, well-structured.",
            risk_signals=[],
            questions=["Walk me through the loop."],
            recommendations=["Consider docstrings."],
            metadata={},
        )
        return AnalysisResult(
            report=report,
            raw_text='{"summary":"ok"}',
            tokens_used=TokenUsage(prompt_tokens=120, completion_tokens=60, total_tokens=180),
            cost_estimate=Decimal("0.001"),
            cached=False,
            provider=self.name,
            model=self.model,
            prompt_version=prompt_version,
            latency_ms=42,
            currency="USD",
        )


class StubProviderFactory:
    def __init__(self, *, fail_with: Exception | None = None) -> None:
        self._fail = fail_with

    def build(self, cfg: Any, api_key: str | None) -> StubProvider:
        return StubProvider(name=cfg.provider, model=cfg.model, fail_with=self._fail)


@pytest.fixture()
def stub_provider_factory() -> Iterator[StubProviderFactory]:
    factory = StubProviderFactory()
    set_provider_factory(factory)  # type: ignore[arg-type]
    yield factory
    set_provider_factory(None)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Submission client stub
# ---------------------------------------------------------------------------


class StubSubmissionClient:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create_feedback_from_llm(
        self,
        submission_id: str,
        *,
        tenant_id: str,
        actor_id: str | None,
        body: dict[str, Any],
    ) -> dict[str, Any]:
        rec = {
            "submission_id": submission_id,
            "tenant_id": tenant_id,
            "actor_id": actor_id,
            "body": body,
        }
        self.calls.append(rec)
        return {"id": "fbk_stub_001", "submission_id": submission_id}


@pytest.fixture()
def stub_submission_client() -> Iterator[StubSubmissionClient]:
    client = StubSubmissionClient()
    set_submission_client(client)  # type: ignore[arg-type]
    yield client
    set_submission_client(None)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# HTTP test client
# ---------------------------------------------------------------------------


@pytest.fixture()
async def app(
    session_factory: Any,
    redis_client: Any,
    fake_publisher: Any,
    stub_provider_factory: Any,
    stub_submission_client: Any,
) -> Iterator[Any]:
    application = create_app()
    yield application


@pytest.fixture()
async def client(app: Any) -> AsyncIterator[AsyncClient]:
    headers = {
        "X-Test-User": "usr_t1",
        "X-Test-Tenant": "tnt_t1",
        "X-Test-Role": "admin",
        "X-Test-Course-Roles": "crs_1:owner",
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://t", headers=headers) as c:
        yield c
