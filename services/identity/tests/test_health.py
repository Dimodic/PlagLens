"""Health, readyz, metrics, version, JWKS."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


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
