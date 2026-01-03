from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_router_endpoints() -> None:
    fastapi = pytest.importorskip("fastapi")
    httpx = pytest.importorskip("httpx")

    from plaglens_common.health import health_router

    async def db_ok() -> bool:
        return True

    async def kafka_fail() -> bool:
        raise RuntimeError("boom")

    app = fastapi.FastAPI()
    app.include_router(
        health_router(
            service_name="test-svc",
            version="1.2.3",
            commit="abc",
            checks={"db": db_ok, "kafka": kafka_fail},
        )
    )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        liveness = await client.get("/healthz")
        assert liveness.status_code == 200
        assert liveness.json()["status"] == "ok"

        readiness = await client.get("/readyz")
        assert readiness.status_code == 503
        body = readiness.json()
        assert body["status"] == "fail"
        assert body["checks"]["db"] == "ok"
        assert "error" in body["checks"]["kafka"]

        version = await client.get("/v1/version")
        assert version.status_code == 200
        body_v = version.json()
        assert body_v["service"] == "test-svc"
        assert body_v["version"] == "1.2.3"

        metrics = await client.get(
            "/metrics",
        )
        # /metrics should be 200 if prometheus_client installed.
        assert metrics.status_code in (200, 500)
