"""GET /v1/health — aggregated backend health."""

from __future__ import annotations

import asyncio
import time

import httpx
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from gateway_service.config import settings
from gateway_service.proxy.http_client import get_http_client
from gateway_service.schemas.common import BackendHealth, HealthAggregate

router = APIRouter()


async def _probe(client: httpx.AsyncClient, name: str, base: str) -> BackendHealth:
    url = base.rstrip("/") + "/healthz"
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=httpx.Timeout(2.0, connect=1.0))
        latency = (time.perf_counter() - t0) * 1000.0
        return BackendHealth(
            name=name,
            healthy=200 <= r.status_code < 400,
            status_code=r.status_code,
            latency_ms=round(latency, 2),
        )
    except Exception as e:
        latency = (time.perf_counter() - t0) * 1000.0
        return BackendHealth(
            name=name,
            healthy=False,
            error=type(e).__name__,
            latency_ms=round(latency, 2),
        )


@router.get("/v1/health", response_model=HealthAggregate, tags=["health"])
async def aggregated_health() -> JSONResponse:
    backends = settings.backends_map()
    client = get_http_client()
    results = await asyncio.gather(
        *[_probe(client, name, base) for name, base in backends.items()]
    )
    healthy = sum(1 for r in results if r.healthy)
    total = len(results)
    if healthy == total:
        status = "healthy"
        http_status = 200
    elif healthy >= total // 2:
        status = "degraded"
        http_status = 200
    else:
        status = "unhealthy"
        http_status = 503
    body = HealthAggregate(status=status, backends=results)
    return JSONResponse(content=body.model_dump(), status_code=http_status)


__all__ = ["router"]
