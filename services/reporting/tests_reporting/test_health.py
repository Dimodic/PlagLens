"""Health, readiness, version, metrics endpoints."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_healthz(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/healthz")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_version(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/version")
        assert r.status_code == 200
        assert "version" in r.json()


@pytest.mark.asyncio
async def test_readyz(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/readyz")
        assert r.status_code == 200
        body = r.json()
        assert "checks" in body
        assert body["checks"]["db"] == "ok"


@pytest.mark.asyncio
async def test_metrics(client_factory, teacher_principal):
    async with client_factory(teacher_principal) as cli:
        r = await cli.get("/api/v1/metrics")
        assert r.status_code == 200
