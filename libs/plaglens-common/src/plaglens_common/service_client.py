"""HTTP client for inter-service calls.

Adds:
- request retries with exponential backoff (idempotent verbs only by default)
- naive circuit breaker (process-local, opens after N consecutive failures)
- `X-Request-Id` propagation
- automatic Problem-detail to `PlagLensError` translation
"""

from __future__ import annotations

import asyncio
import logging
import random
import time
from contextvars import ContextVar
from typing import Any

import httpx

from .errors import (
    ConflictError,
    ForbiddenError,
    NotFoundError,
    PlagLensError,
    RateLimitError,
    TenantMismatchError,
    UnauthenticatedError,
    UpstreamFailedError,
    UpstreamTimeoutError,
    ValidationError,
)
from .headers import REQUEST_ID
from .metrics import record_external_call

logger = logging.getLogger(__name__)

current_request_id: ContextVar[str | None] = ContextVar("current_request_id", default=None)

_RETRYABLE_METHODS: frozenset[str] = frozenset({"GET", "HEAD", "OPTIONS", "PUT", "DELETE"})
_RETRY_STATUSES: frozenset[int] = frozenset({502, 503, 504})

_STATUS_TO_ERROR: dict[int, type[PlagLensError]] = {
    400: ValidationError,
    401: UnauthenticatedError,
    403: ForbiddenError,
    404: NotFoundError,
    409: ConflictError,
    422: ValidationError,
    429: RateLimitError,
    502: UpstreamFailedError,
    503: UpstreamFailedError,
    504: UpstreamTimeoutError,
}


class CircuitBreakerOpen(UpstreamFailedError):
    """Raised when the circuit is open and short-circuiting requests."""


class _CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_seconds: float = 30.0) -> None:
        self.failure_threshold = failure_threshold
        self.recovery_seconds = recovery_seconds
        self._failures = 0
        self._opened_at: float | None = None

    def allow(self) -> bool:
        if self._opened_at is None:
            return True
        if time.monotonic() - self._opened_at >= self.recovery_seconds:
            # half-open: allow one probe
            self._opened_at = None
            self._failures = 0
            return True
        return False

    def record_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def record_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failure_threshold:
            self._opened_at = time.monotonic()


class ServiceClient:
    """`httpx.AsyncClient` wrapper for inter-service HTTP calls."""

    def __init__(
        self,
        base_url: str,
        *,
        provider: str = "service",
        timeout: float = 5.0,
        max_retries: int = 3,
        backoff_initial: float = 0.1,
        backoff_max: float = 2.0,
        circuit_failure_threshold: int = 5,
        circuit_recovery_seconds: float = 30.0,
        client: httpx.AsyncClient | None = None,
        default_headers: dict[str, str] | None = None,
    ) -> None:
        self._provider = provider
        self._max_retries = max_retries
        self._backoff_initial = backoff_initial
        self._backoff_max = backoff_max
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(
            base_url=base_url, timeout=timeout, headers=default_headers
        )
        self._breaker = _CircuitBreaker(circuit_failure_threshold, circuit_recovery_seconds)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def __aenter__(self) -> ServiceClient:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        await self.aclose()

    def _prepare_headers(self, headers: dict[str, str] | None) -> dict[str, str]:
        out: dict[str, str] = dict(headers or {})
        rid = current_request_id.get()
        if rid and REQUEST_ID not in out:
            out[REQUEST_ID] = rid
        return out

    async def request(
        self,
        method: str,
        url: str,
        *,
        params: Any = None,
        json: Any = None,
        content: Any = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        method = method.upper()
        if not self._breaker.allow():
            raise CircuitBreakerOpen(
                f"Circuit open for {self._provider}; refusing {method} {url}"
            )

        attempt = 0
        last_exc: Exception | None = None
        while attempt <= self._max_retries:
            start = time.perf_counter()
            try:
                response = await self._client.request(
                    method,
                    url,
                    params=params,
                    json=json,
                    content=content,
                    headers=self._prepare_headers(headers),
                )
            except httpx.TimeoutException as exc:
                last_exc = exc
                self._breaker.record_failure()
                record_external_call(self._provider, url, time.perf_counter() - start, "timeout")
                if attempt < self._max_retries and method in _RETRYABLE_METHODS:
                    await asyncio.sleep(self._sleep_for(attempt))
                    attempt += 1
                    continue
                raise UpstreamTimeoutError(f"Timeout calling {url}") from exc
            except httpx.HTTPError as exc:
                last_exc = exc
                self._breaker.record_failure()
                record_external_call(
                    self._provider, url, time.perf_counter() - start, "transport_error"
                )
                if attempt < self._max_retries and method in _RETRYABLE_METHODS:
                    await asyncio.sleep(self._sleep_for(attempt))
                    attempt += 1
                    continue
                raise UpstreamFailedError(f"Transport error calling {url}: {exc}") from exc

            duration = time.perf_counter() - start
            if (
                response.status_code in _RETRY_STATUSES
                and method in _RETRYABLE_METHODS
                and attempt < self._max_retries
            ):
                self._breaker.record_failure()
                record_external_call(self._provider, url, duration, str(response.status_code))
                await asyncio.sleep(self._sleep_for(attempt))
                attempt += 1
                continue

            if response.status_code >= 500:
                self._breaker.record_failure()
            else:
                self._breaker.record_success()

            record_external_call(
                self._provider,
                url,
                duration,
                "ok" if response.is_success else str(response.status_code),
            )
            self._raise_for_problem(response)
            return response

        # Should be unreachable; safety net.
        raise UpstreamFailedError(f"Exhausted retries for {url}: {last_exc}")  # pragma: no cover

    def _sleep_for(self, attempt: int) -> float:
        base = min(self._backoff_max, self._backoff_initial * (2**attempt))
        return base + random.uniform(0, base * 0.1)

    def _raise_for_problem(self, response: httpx.Response) -> None:
        if response.is_success:
            return
        status = response.status_code
        cls = _STATUS_TO_ERROR.get(status, UpstreamFailedError)
        detail = None
        try:
            body = response.json()
        except ValueError:
            body = None
        if isinstance(body, dict):
            detail = str(body.get("detail") or body.get("title") or body.get("code") or "")
            code = body.get("code")
            if code == "TENANT_MISMATCH":
                raise TenantMismatchError(detail or "Tenant mismatch")
        raise cls(detail or f"HTTP {status}")

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("POST", url, **kwargs)

    async def patch(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("PATCH", url, **kwargs)

    async def delete(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("DELETE", url, **kwargs)


__all__ = ["CircuitBreakerOpen", "ServiceClient", "current_request_id"]
