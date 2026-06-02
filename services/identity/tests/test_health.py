"""Health, readyz, metrics, version, JWKS."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_readyz(client):
    # Both DB (session factory monkeypatched to the in-memory engine) and
    # Redis (FakeRedis.ping -> True) are healthy in the test fixtures.
    r = await client.get("/readyz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["checks"]["db"] == "ok"
    assert body["checks"]["redis"] == "ok"


@pytest.mark.asyncio
async def test_readyz_degraded_when_redis_missing(app, client):
    # Drop the Redis client to exercise the failure path -> 503 + fail reason.
    saved, app.state.redis = app.state.redis, None
    try:
        r = await client.get("/readyz")
        assert r.status_code == 503
        body = r.json()
        assert body["status"] == "degraded"
        assert body["checks"]["db"] == "ok"
        assert body["checks"]["redis"].startswith("fail:")
    finally:
        app.state.redis = saved


@pytest.mark.asyncio
async def test_metrics(client):
    r = await client.get("/metrics")
    assert r.status_code == 200
    assert "http_requests_total" in r.text


@pytest.mark.asyncio
async def test_version(client):
    r = await client.get("/api/v1/version")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "identity-service"


@pytest.mark.asyncio
async def test_jwks(client):
    r = await client.get("/api/v1/.well-known/jwks.json")
    assert r.status_code == 200
    keys = r.json().get("keys")
    assert isinstance(keys, list) and keys
    assert keys[0]["kty"] == "RSA"
