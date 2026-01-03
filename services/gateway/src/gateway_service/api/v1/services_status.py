"""GET /v1/services-status — super_admin only."""

from __future__ import annotations

import asyncio
import time

import httpx
from fastapi import APIRouter

from gateway_service.config import settings
from gateway_service.proxy.http_client import get_http_client
from gateway_service.schemas.common import BackendHealth, ServicesStatus

router = APIRouter()


async def _probe(client: httpx.AsyncClient, name: str, base: str) -> BackendHealth:
    url = base.rstrip("/") + "/readyz"
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=httpx.Timeout(3.0, connect=1.5))
        return BackendHealth(
            name=name,
            healthy=200 <= r.status_code < 400,
            status_code=r.status_code,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )
    except Exception as e:
        return BackendHealth(
            name=name,
            healthy=False,
            error=type(e).__name__,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )


async def _services_status_payload() -> ServicesStatus:
    backends = settings.backends_map()
    client = get_http_client()
    results = await asyncio.gather(
        *[_probe(client, name, base) for name, base in backends.items()]
    )
    return ServicesStatus(
        backends=results,
        healthy_count=sum(1 for r in results if r.healthy),
        total_count=len(results),
    )


@router.get("/v1/services-status", response_model=ServicesStatus, tags=["admin"])
async def services_status_legacy() -> ServicesStatus:
    return await _services_status_payload()


@router.get("/api/v1/services-status", response_model=ServicesStatus, tags=["admin"])
async def services_status() -> ServicesStatus:
    return await _services_status_payload()


__all__ = ["router"]
