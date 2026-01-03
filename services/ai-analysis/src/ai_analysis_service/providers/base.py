"""OpenAI-compatible provider client.

A single class that talks to any endpoint exposing the OpenAI Chat
Completions API: OpenAI itself, OpenRouter, vLLM, llama.cpp server, TGI, or
proxy-shimmed Yandex GPT / GigaChat. The same code path serves all of them.

Selection between native ``response_format=json_schema`` and a
``tool_use`` fallback is driven by ``ProviderCapabilities.supports_json_schema``.

OpenRouter convention: app attribution headers ``HTTP-Referer`` + ``X-Title``
are forwarded with every request when configured.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from openai import APIStatusError, AsyncOpenAI

from ..schemas import PlagLensReport

logger = logging.getLogger(__name__)


@dataclass
class ProviderCapabilities:
    supports_json_schema: bool = True
    max_context: int = 32000


@dataclass
class TokenUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


@dataclass
class AnalysisResult:
    report: PlagLensReport
    raw_text: str
    tokens_used: TokenUsage
    cost_estimate: Decimal
    cached: bool
    provider: str
    model: str
    prompt_version: str
    latency_ms: int
    currency: str = "USD"
    metadata: dict[str, Any] = field(default_factory=dict)


# ----------------------------- Errors -----------------------------------

class ProviderError(Exception):
    """Raised when a provider call fails (HTTP status carried separately)."""

    def __init__(self, message: str, *, status: int = 0) -> None:
        super().__init__(message)
        self.status = status


# Status codes that should trigger a retry (with exponential backoff) before
# giving up and letting the orchestrator fail over to the next provider.
_RETRYABLE_STATUSES = {408, 425, 429, 500, 502, 503, 504}


# ----------------------------- Cost calc --------------------------------

def estimate_cost(
    pricing: dict[str, Any] | None,
    prompt_tokens: int,
    completion_tokens: int,
) -> tuple[Decimal, str]:
    if not pricing:
        return Decimal("0"), "USD"
    p = Decimal(str(pricing.get("prompt_per_1k", 0)))
    c = Decimal(str(pricing.get("completion_per_1k", 0)))
    currency = str(pricing.get("currency", "USD"))
    cost = (p * Decimal(prompt_tokens) + c * Decimal(completion_tokens)) / Decimal(1000)
    return cost.quantize(Decimal("0.000001")), currency


# ----------------------------- Client -----------------------------------

class OpenAICompatibleProvider:
    """Single class working against any OpenAI-compat ``/v1`` endpoint.

    Parameters
    ----------
    extra_headers
        Forwarded with every chat-completions request. Used for OpenRouter
        ``HTTP-Referer`` and ``X-Title`` (app attribution).
    retry_backoffs
        Sleep-seconds between retries on retryable 429/5xx. Defaults to
        ``[1.0, 2.0, 5.0]`` per spec. ``Retry-After`` from the upstream
        response (if present and parsable) overrides the next backoff slot.
    temperature
        Sampling temperature; defaults to ``0.2`` for code-review tasks.
    """

    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        api_key: str | None,
        model: str,
        capabilities: ProviderCapabilities | None = None,
        max_completion_tokens: int = 2000,
        timeout_s: int = 60,
        pricing: dict[str, Any] | None = None,
        client: AsyncOpenAI | None = None,
        extra_headers: dict[str, str] | None = None,
        retry_backoffs: list[float] | None = None,
        temperature: float = 0.2,
    ) -> None:
        self.name = name
        self.base_url = base_url
        self.model = model
        self.capabilities = capabilities or ProviderCapabilities()
        self.max_completion_tokens = max_completion_tokens
        self.timeout_s = timeout_s
        self.pricing = pricing
        self.extra_headers = dict(extra_headers or {})
        self.retry_backoffs = list(retry_backoffs) if retry_backoffs else [1.0, 2.0, 5.0]
        self.temperature = float(temperature)
        if client is not None:
            self._client = client
        else:
            kwargs: dict[str, Any] = {
                "base_url": base_url,
                "api_key": api_key or "missing",
                "timeout": timeout_s,
                # Disable the OpenAI SDK's built-in retry loop — the provider
                # owns retry policy (1/2/5s w/ Retry-After) so the SDK's hidden
                # retries do not double-charge or hide upstream status codes.
                "max_retries": 0,
            }
            if self.extra_headers:
                kwargs["default_headers"] = dict(self.extra_headers)
            self._client = AsyncOpenAI(**kwargs)

    async def analyze(
        self,
        *,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any],
        prompt_version: str,
    ) -> AnalysisResult:
        start = time.perf_counter()
        if self.capabilities.supports_json_schema:
            content, usage, raw = await self._call_json_schema(
                system_prompt, user_message, json_schema
            )
        else:
            content, usage, raw = await self._call_tool_use(
                system_prompt, user_message, json_schema
            )

        latency_ms = int((time.perf_counter() - start) * 1000)
        report = _parse_report(content)
        cost, currency = estimate_cost(self.pricing, usage.prompt_tokens, usage.completion_tokens)
        return AnalysisResult(
            report=report,
            raw_text=raw,
            tokens_used=usage,
            cost_estimate=cost,
            cached=False,
            provider=self.name,
            model=self.model,
            prompt_version=prompt_version,
            latency_ms=latency_ms,
            currency=currency,
        )

    # ----- JSON-schema path -----

    async def _call_json_schema(
        self,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any],
    ) -> tuple[str, TokenUsage, str]:
        async def _do() -> Any:
            return await self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=self.max_completion_tokens,
                temperature=self.temperature,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": "PlagLensReport",
                        "schema": _strip_unsupported(json_schema),
                        "strict": True,
                    },
                },
                extra_headers=self.extra_headers or None,
            )

        resp = await self._with_retries(_do)
        return _extract_message(resp)

    # ----- Tool-use fallback -----

    async def _call_tool_use(
        self,
        system_prompt: str,
        user_message: str,
        json_schema: dict[str, Any],
    ) -> tuple[str, TokenUsage, str]:
        tool_def = {
            "type": "function",
            "function": {
                "name": "submit_plaglens_report",
                "description": "Return the structured PlagLensReport.",
                "parameters": _strip_unsupported(json_schema),
            },
        }

        async def _do() -> Any:
            return await self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
                max_tokens=self.max_completion_tokens,
                temperature=self.temperature,
                tools=[tool_def],
                tool_choice={
                    "type": "function",
                    "function": {"name": "submit_plaglens_report"},
                },
                extra_headers=self.extra_headers or None,
            )

        resp = await self._with_retries(_do)
        return _extract_tool_call(resp)

    # ----- Retry / backoff -----

    async def _with_retries(self, do):  # type: ignore[no-untyped-def]
        attempts = len(self.retry_backoffs) + 1
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                return await do()
            except APIStatusError as exc:
                status = _status_of(exc)
                last_exc = exc
                if status not in _RETRYABLE_STATUSES or attempt >= len(self.retry_backoffs):
                    raise ProviderError(str(exc), status=status) from exc
                delay = _retry_after_seconds(exc) or self.retry_backoffs[attempt]
                logger.info(
                    "provider %s retry %d/%d after %.2fs (status=%s)",
                    self.name, attempt + 1, len(self.retry_backoffs), delay, status,
                )
                await asyncio.sleep(delay)
            except Exception as exc:  # noqa: BLE001
                # Non-API-status errors (network, timeouts) — retry once if backoffs allow.
                last_exc = exc
                status = _status_of(exc)
                if attempt >= len(self.retry_backoffs):
                    raise ProviderError(str(exc), status=status) from exc
                delay = self.retry_backoffs[attempt]
                logger.info(
                    "provider %s network retry %d/%d after %.2fs (%s)",
                    self.name, attempt + 1, len(self.retry_backoffs), delay, exc,
                )
                await asyncio.sleep(delay)
        # Should not reach here; defensive fallback.
        raise ProviderError(str(last_exc) if last_exc else "unknown error",
                            status=_status_of(last_exc) if last_exc else 0)


# ----------------------------- Helpers ----------------------------------

def _extract_message(resp: Any) -> tuple[str, TokenUsage, str]:
    choice = resp.choices[0]
    msg = choice.message
    content = msg.content if isinstance(msg.content, str) else json.dumps(msg.content or {})
    usage = _extract_usage(resp)
    return content, usage, content


def _extract_tool_call(resp: Any) -> tuple[str, TokenUsage, str]:
    choice = resp.choices[0]
    tool_calls = getattr(choice.message, "tool_calls", None) or []
    raw_text = ""
    if tool_calls:
        first = tool_calls[0]
        raw_text = first.function.arguments or ""
    elif choice.message.content:
        raw_text = choice.message.content
    usage = _extract_usage(resp)
    return raw_text, usage, raw_text


def _extract_usage(resp: Any) -> TokenUsage:
    usage_obj = getattr(resp, "usage", None)
    if usage_obj is None:
        return TokenUsage()
    return TokenUsage(
        prompt_tokens=int(getattr(usage_obj, "prompt_tokens", 0) or 0),
        completion_tokens=int(getattr(usage_obj, "completion_tokens", 0) or 0),
        total_tokens=int(getattr(usage_obj, "total_tokens", 0) or 0),
    )


def _parse_report(content: str) -> PlagLensReport:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        # Last-resort: try to find a JSON object inside the text.
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ProviderError("LLM did not return JSON", status=502)
        data = json.loads(content[start : end + 1])
    return PlagLensReport.model_validate(data)


def _status_of(exc: Exception | None) -> int:
    if exc is None:
        return 0
    status = getattr(exc, "status_code", None)
    if status is None:
        status = getattr(exc, "status", None)
    if status is None:
        # ``openai.APIStatusError`` exposes ``response.status_code``.
        resp = getattr(exc, "response", None)
        status = getattr(resp, "status_code", None)
    try:
        return int(status) if status is not None else 0
    except (TypeError, ValueError):
        return 0


def _retry_after_seconds(exc: Exception) -> float | None:
    """Honor ``Retry-After`` HTTP header from upstream when present."""
    resp = getattr(exc, "response", None)
    headers = getattr(resp, "headers", None)
    if headers is None:
        return None
    raw = None
    try:
        raw = headers.get("retry-after") or headers.get("Retry-After")
    except Exception:  # noqa: BLE001
        return None
    if not raw:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _strip_unsupported(schema: dict[str, Any]) -> dict[str, Any]:
    """Make the schema acceptable to strict OpenAI-compat ``json_schema``
    validators (OpenAI structured outputs / Azure OpenAI via OpenRouter).

    Steps:
      1. Inline every ``$ref`` pointing at ``#/$defs/...`` / ``#/definitions/...``
         so the schema is self-contained.
      2. Drop ``$defs`` / ``definitions`` containers (no longer referenced).
      3. Drop pydantic-only annotation keys (``title``, ``examples``) that some
         providers reject.
    """
    cleaned = json.loads(json.dumps(schema))
    defs = {}
    for key in ("$defs", "definitions"):
        if isinstance(cleaned.get(key), dict):
            defs.update(cleaned[key])
    if defs:
        cleaned = _inline_refs(cleaned, defs)
    _strip_keys(cleaned, ("title", "examples", "$defs", "definitions"))
    _enforce_strict(cleaned)
    return cleaned


def _enforce_strict(node: Any) -> None:
    """OpenAI / Azure structured-output strict mode requirements:

      - every ``object`` schema must declare ``additionalProperties: false``
        and ``required`` listing every property.
      - every ``array`` schema must declare ``items``. ``prefixItems``
        (tuple types generated by pydantic for ``tuple[int, int]``) and
        ``min/maxItems`` are not understood — collapse to ``items`` of the
        first prefix type.

    Safe for permissive providers — the result is still valid JSON Schema."""
    if isinstance(node, dict):
        # --- array normalisation ---
        if node.get("type") == "array":
            if "prefixItems" in node and "items" not in node:
                prefix = node.pop("prefixItems")
                if isinstance(prefix, list) and prefix:
                    node["items"] = prefix[0]
                else:
                    node["items"] = {}
                node.pop("minItems", None)
                node.pop("maxItems", None)
            elif "items" not in node:
                node["items"] = {}

        # --- object strictness ---
        is_object = node.get("type") == "object" or (
            "properties" in node and node.get("type") is None
        )
        if is_object:
            node["additionalProperties"] = False
            props = node.get("properties")
            if isinstance(props, dict):
                # Strict mode requires *every* property in required, even
                # ones pydantic marked optional via default=None. Their
                # nullability is expressed via anyOf/null in the type.
                node["required"] = list(props.keys())

        for v in node.values():
            _enforce_strict(v)
    elif isinstance(node, list):
        for item in node:
            _enforce_strict(item)


def _inline_refs(node: Any, defs: dict[str, Any], _seen: tuple[str, ...] = ()) -> Any:
    """Replace ``{"$ref": "#/$defs/Foo"}`` nodes with the inlined Foo schema.

    Cycle-safe: a ref re-encountered within the current expansion chain is
    replaced with ``{}`` (rare in our schemas — RiskSignal/etc. are flat).
    """
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and (ref.startswith("#/$defs/") or ref.startswith("#/definitions/")):
            name = ref.split("/")[-1]
            if name in _seen:
                return {}
            target = defs.get(name)
            if target is None:
                # Unresolvable — drop the ref so strict validators don't choke.
                return {}
            expanded = _inline_refs(target, defs, _seen + (name,))
            # Merge any sibling keys (e.g. description) the ref carried.
            siblings = {k: v for k, v in node.items() if k != "$ref"}
            if isinstance(expanded, dict) and siblings:
                merged = dict(expanded)
                merged.update(siblings)
                return _inline_refs(merged, defs, _seen + (name,))
            return expanded
        return {k: _inline_refs(v, defs, _seen) for k, v in node.items()}
    if isinstance(node, list):
        return [_inline_refs(item, defs, _seen) for item in node]
    return node


def _strip_keys(node: Any, keys: tuple[str, ...]) -> None:
    if isinstance(node, dict):
        for k in list(node.keys()):
            if k in keys:
                node.pop(k, None)
            else:
                _strip_keys(node[k], keys)
    elif isinstance(node, list):
        for item in node:
            _strip_keys(item, keys)
