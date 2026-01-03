from __future__ import annotations

import httpx
import pytest

from plaglens_common.errors import (
    ConflictError,
    NotFoundError,
    UpstreamFailedError,
    UpstreamTimeoutError,
)
from plaglens_common.headers import REQUEST_ID
from plaglens_common.service_client import (
    CircuitBreakerOpen,
    ServiceClient,
    current_request_id,
)


@pytest.mark.asyncio
async def test_get_success_returns_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(base_url="http://up", client=inner)
        resp = await client.get("/v1/x")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_404_translates_to_not_found_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            404,
            json={"code": "NOT_FOUND", "title": "missing", "status": 404},
            headers={"content-type": "application/problem+json"},
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(base_url="http://up", client=inner)
        with pytest.raises(NotFoundError):
            await client.get("/v1/missing")


@pytest.mark.asyncio
async def test_409_translates_to_conflict_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            409,
            json={"code": "CONFLICT", "title": "dup", "status": 409, "detail": "x"},
            headers={"content-type": "application/problem+json"},
        )

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(base_url="http://up", client=inner)
        with pytest.raises(ConflictError):
            await client.post("/v1/things", json={})


@pytest.mark.asyncio
async def test_retries_503_and_succeeds() -> None:
    state = {"calls": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        state["calls"] += 1
        if state["calls"] < 3:
            return httpx.Response(503)
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(base_url="http://up", client=inner, max_retries=4, backoff_initial=0.01)
        resp = await client.get("/v1/flaky")
        assert resp.status_code == 200
        assert state["calls"] == 3


@pytest.mark.asyncio
async def test_request_id_propagation() -> None:
    seen_headers: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        for k, v in request.headers.items():
            seen_headers[k.lower()] = v
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(base_url="http://up", client=inner)
        token = current_request_id.set("rid-xyz")
        try:
            await client.get("/v1/x")
        finally:
            current_request_id.reset(token)

    assert seen_headers.get(REQUEST_ID.lower()) == "rid-xyz"


@pytest.mark.asyncio
async def test_timeout_raises_upstream_timeout() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("slow", request=request)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(
            base_url="http://up",
            client=inner,
            max_retries=1,
            backoff_initial=0.001,
        )
        with pytest.raises(UpstreamTimeoutError):
            await client.get("/v1/slow")


@pytest.mark.asyncio
async def test_circuit_breaker_opens_after_threshold() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(base_url="http://up", transport=transport) as inner:
        client = ServiceClient(
            base_url="http://up",
            client=inner,
            max_retries=0,
            circuit_failure_threshold=2,
            circuit_recovery_seconds=60,
        )
        with pytest.raises(UpstreamFailedError):
            await client.post("/v1/x", json={})
        with pytest.raises(UpstreamFailedError):
            await client.post("/v1/x", json={})
        with pytest.raises(CircuitBreakerOpen):
            await client.post("/v1/x", json={})
