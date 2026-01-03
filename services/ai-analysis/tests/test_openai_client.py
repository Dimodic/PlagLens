"""OpenAI-compat provider tests (with OpenRouter base_url + retries + failover).

The transport layer is fully mocked via ``respx``; no real network calls.
Covers:

- structured response parsing (existing behavior)
- OpenRouter convention: ``HTTP-Referer`` + ``X-Title`` headers carried on
  every chat-completions request
- request body shape: model / temperature / response_format
- prompt-injection defense: the user message wraps code in
  ``<student_code>...</student_code>``
- retry on 429 / 5xx with backoff (followed by success)
- orchestrator failover: primary errors → secondary tried + cache populated;
  identical request → cache hit, no LLM call
"""
from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
import respx
from openai import AsyncOpenAI

from ai_analysis_service.providers.base import (
    OpenAICompatibleProvider,
    ProviderCapabilities,
    ProviderError,
)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


def _ok_payload(content: dict[str, Any], *, model: str = "openai/gpt-4o-mini") -> dict:
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": json.dumps(content),
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 20, "total_tokens": 30},
    }


_REPORT = {
    "summary": "Looks fine",
    "risk_signals": [],
    "questions": ["Why this loop?"],
    "recommendations": [],
    "metadata": {},
}


# ----------------------- existing OpenAI happy-path ------------------------


@pytest.mark.asyncio
@respx.mock
async def test_openai_compat_provider_parses_json_schema_response() -> None:
    """The OpenAICompatibleProvider issues a single chat-completion request
    and parses the JSON output into a PlagLensReport."""
    route = respx.post("https://api.openai.com/v1/chat/completions").mock(
        return_value=httpx.Response(200, json=_ok_payload(_REPORT, model="gpt-4o-mini"))
    )

    client = AsyncOpenAI(base_url="https://api.openai.com/v1", api_key="test")
    provider = OpenAICompatibleProvider(
        name="openai",
        base_url="https://api.openai.com/v1",
        api_key="test",
        model="gpt-4o-mini",
        capabilities=ProviderCapabilities(supports_json_schema=True),
        client=client,
        pricing={"prompt_per_1k": 0.001, "completion_per_1k": 0.002, "currency": "USD"},
    )

    schema = {
        "type": "object",
        "properties": {"summary": {"type": "string"}},
        "required": ["summary"],
    }
    result = await provider.analyze(
        system_prompt="sys",
        user_message="hello",
        json_schema=schema,
        prompt_version="v1",
    )
    assert result.report.summary == "Looks fine"
    assert result.tokens_used.total_tokens == 30
    assert route.called


# ----------------------- OpenRouter base_url + headers ---------------------


@pytest.mark.asyncio
@respx.mock
async def test_openrouter_base_url_and_attribution_headers() -> None:
    """Verify base_url=https://openrouter.ai/api/v1 + HTTP-Referer/X-Title go
    out on the wire and the request body has model + temperature + json_schema."""
    captured: dict[str, Any] = {}

    def _handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            200, json=_ok_payload(_REPORT, model="openai/gpt-4o-mini")
        )

    route = respx.post(f"{OPENROUTER_BASE_URL}/chat/completions").mock(side_effect=_handler)

    provider = OpenAICompatibleProvider(
        name="openrouter-gpt-4o-mini",
        base_url=OPENROUTER_BASE_URL,
        api_key="sk-or-test",
        model="openai/gpt-4o-mini",
        capabilities=ProviderCapabilities(supports_json_schema=True),
        extra_headers={
            "HTTP-Referer": "https://plaglens.local",
            "X-Title": "PlagLens",
        },
        temperature=0.2,
        retry_backoffs=[0.0, 0.0, 0.0],
    )

    schema = {
        "type": "object",
        "properties": {"summary": {"type": "string"}},
        "required": ["summary"],
    }
    code_block = (
        "Курс: Algos\nЗадание: q1\nЯзык: python\nКод:\n"
        "<student_code>\nprint('hi')\n</student_code>"
    )
    result = await provider.analyze(
        system_prompt="sys",
        user_message=code_block,
        json_schema=schema,
        prompt_version="v1",
    )
    assert result.report.summary == "Looks fine"
    assert route.called
    # Attribution headers are present.
    headers = captured["headers"]
    assert headers.get("http-referer") == "https://plaglens.local"
    assert headers.get("x-title") == "PlagLens"
    # Body shape is correct.
    body = captured["body"]
    assert body["model"] == "openai/gpt-4o-mini"
    assert body["temperature"] == 0.2
    assert body["response_format"]["type"] == "json_schema"
    assert body["response_format"]["json_schema"]["name"] == "PlagLensReport"
    # User message preserves the <student_code> wrapper.
    assert any(
        "<student_code>" in m.get("content", "")
        and "</student_code>" in m.get("content", "")
        for m in body["messages"]
    )


# ----------------------- retry on 429 / 5xx --------------------------------


@pytest.mark.asyncio
@respx.mock
async def test_retry_on_429_then_success() -> None:
    """First call returns 429, second returns 200 — provider retries with the
    configured backoff (set to 0.0 here so the test runs fast)."""
    route = respx.post(f"{OPENROUTER_BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(429, headers={"Retry-After": "0"}, json={"error": "slow"}),
            httpx.Response(200, json=_ok_payload(_REPORT, model="openai/gpt-4o-mini")),
        ]
    )
    provider = OpenAICompatibleProvider(
        name="openrouter",
        base_url=OPENROUTER_BASE_URL,
        api_key="k",
        model="openai/gpt-4o-mini",
        capabilities=ProviderCapabilities(supports_json_schema=True),
        retry_backoffs=[0.0, 0.0, 0.0],
    )
    schema = {"type": "object", "properties": {"summary": {"type": "string"}},
              "required": ["summary"]}
    result = await provider.analyze(
        system_prompt="sys",
        user_message="hi",
        json_schema=schema,
        prompt_version="v1",
    )
    assert route.call_count == 2
    assert result.tokens_used.total_tokens == 30


@pytest.mark.asyncio
@respx.mock
async def test_retry_exhausted_raises_provider_error() -> None:
    """All retries return 503 → ProviderError(status=503)."""
    respx.post(f"{OPENROUTER_BASE_URL}/chat/completions").mock(
        side_effect=[
            httpx.Response(503, json={"error": "down"}),
            httpx.Response(503, json={"error": "down"}),
        ]
    )
    provider = OpenAICompatibleProvider(
        name="openrouter",
        base_url=OPENROUTER_BASE_URL,
        api_key="k",
        model="openai/gpt-4o-mini",
        retry_backoffs=[0.0],  # 1 retry then give up
    )
    schema = {"type": "object", "properties": {"summary": {"type": "string"}},
              "required": ["summary"]}
    with pytest.raises(ProviderError) as exc:
        await provider.analyze(
            system_prompt="sys",
            user_message="hi",
            json_schema=schema,
            prompt_version="v1",
        )
    assert exc.value.status == 503


# ----------------------- failover + cache via orchestrator -----------------


@pytest.mark.asyncio
async def test_orchestrator_failover_then_cache_hit(
    session_factory: Any, redis_client: Any
) -> None:
    """Primary provider raises ProviderError; orchestrator advances to the
    secondary, completes the analysis, and writes to cache. A second identical
    request returns a cache hit without any provider call."""
    from decimal import Decimal

    from ai_analysis_service.events.producer import EventPublisher
    from ai_analysis_service.models import ProviderConfig
    from ai_analysis_service.providers.base import (
        AnalysisResult,
        TokenUsage,
    )
    from ai_analysis_service.schemas import PlagLensReport
    from ai_analysis_service.services.cache import AnalysisCache
    from ai_analysis_service.services.orchestrator import (
        AnalysisRequest,
        Orchestrator,
    )
    from ai_analysis_service.services.prompt_loader import PromptLoader

    class FakeProvider:
        def __init__(self, name: str, model: str, *, fail_with: Exception | None = None) -> None:
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
        ) -> AnalysisResult:
            if self._fail is not None:
                raise self._fail
            return AnalysisResult(
                report=PlagLensReport(
                    summary="ok",
                    risk_signals=[],
                    questions=["Q?"],
                    recommendations=[],
                    metadata={},
                ),
                raw_text='{"summary":"ok"}',
                tokens_used=TokenUsage(prompt_tokens=10, completion_tokens=5, total_tokens=15),
                cost_estimate=Decimal("0.001"),
                cached=False,
                provider=self.name,
                model=self.model,
                prompt_version=prompt_version,
                latency_ms=10,
                currency="USD",
            )

    class FailoverFactory:
        """Primary fails, secondary succeeds."""

        def build(self, cfg: ProviderConfig, api_key: str | None) -> FakeProvider:
            if cfg.priority == 1:
                return FakeProvider(
                    name=cfg.provider,
                    model=cfg.model,
                    fail_with=ProviderError("upstream 503", status=503),
                )
            return FakeProvider(name=cfg.provider, model=cfg.model)

    # Seed two providers for the same tenant.
    async with session_factory() as session:
        for prio, name, env in [
            (1, "openrouter-gpt-4o-mini", "OPENROUTER_API_KEY"),
            (2, "openai-gpt-4o-mini", "OPENAI_API_KEY"),
        ]:
            session.add(
                ProviderConfig(
                    id=f"pcf_{name}",
                    tenant_id="tnt_or",
                    provider=name,
                    base_url="https://openrouter.ai/api/v1"
                    if "openrouter" in name
                    else "https://api.openai.com/v1",
                    model="openai/gpt-4o-mini",
                    api_key_env_var=env,
                    enabled=True,
                    default_for_tenant=(prio == 1),
                    priority=prio,
                    rate_limit_rpm=60,
                    max_tokens=4096,
                    supports_json_schema=True,
                    settings={},
                )
            )
        await session.commit()

    publisher = EventPublisher()
    publisher._started = True
    cache = AnalysisCache(redis_client)
    factory = FailoverFactory()

    # 1st run: primary fails → secondary succeeds → cache populated.
    async with session_factory() as session:
        orch = Orchestrator(
            session=session,
            cache=cache,
            publisher=publisher,
            provider_factory=factory,  # type: ignore[arg-type]
            prompt_loader=PromptLoader(),
        )
        req = AnalysisRequest(
            tenant_id="tnt_or",
            course_id="crs_1",
            assignment_id=None,
            submission_id="sub_1",
            code="def f(): pass\n",
            language="python",
            force_no_cache=False,
        )
        analysis = await orch.run_analysis(req)
        await session.commit()
        assert analysis.status == "completed"
        assert analysis.cache_hit is False
        # Failover landed on the secondary.
        assert analysis.provider == "openai-gpt-4o-mini"

    # 2nd run with same code → cache hit, no provider call.
    class ExplodeFactory:
        def build(self, cfg, api_key):  # noqa: ANN001
            return FakeProvider(
                name=cfg.provider,
                model=cfg.model,
                fail_with=AssertionError("provider should NOT be called on cache hit"),
            )

    async with session_factory() as session:
        orch = Orchestrator(
            session=session,
            cache=cache,
            publisher=publisher,
            provider_factory=ExplodeFactory(),  # type: ignore[arg-type]
            prompt_loader=PromptLoader(),
        )
        req = AnalysisRequest(
            tenant_id="tnt_or",
            course_id="crs_1",
            assignment_id=None,
            submission_id="sub_2",  # different submission, same code
            code="def f(): pass\n",
            language="python",
            force_no_cache=False,
        )
        analysis2 = await orch.run_analysis(req)
        assert analysis2.status == "completed"
        assert analysis2.cache_hit is True
