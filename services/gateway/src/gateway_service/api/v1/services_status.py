"""GET /v1/services-status — admin only."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime

import httpx
from fastapi import APIRouter

from gateway_service.config import settings
from gateway_service.proxy.http_client import get_http_client
from gateway_service.schemas.common import (
    BackendHealth,
    ServicesStatus,
    ServiceStatusItem,
)

router = APIRouter()


async def _probe(client: httpx.AsyncClient, name: str, base: str) -> BackendHealth:
    url = base.rstrip("/") + "/readyz"
    t0 = time.perf_counter()
    try:
        r = await client.get(url, timeout=httpx.Timeout(3.0, connect=1.5))
        # /readyz returns {"status": …, "checks": {dep: "ok"|"fail"|"error: …"}}
        # on BOTH 200 and 503 — parse the per-dependency breakdown either way.
        checks: dict[str, str] | None = None
        try:
            body = r.json()
            raw = body.get("checks") if isinstance(body, dict) else None
            if isinstance(raw, dict):
                checks = {str(k): str(v) for k, v in raw.items()}
        except Exception:
            checks = None
        return BackendHealth(
            name=name,
            healthy=200 <= r.status_code < 400,
            status_code=r.status_code,
            latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
            checks=checks,
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
    now = datetime.now(UTC).isoformat()
    services = [
        ServiceStatusItem(
            name=r.name,
            # Reachable but a dependency is down (503) → degraded; totally
            # unreachable (no HTTP response) → unhealthy.
            status=(
                "healthy"
                if r.healthy
                else "degraded"
                if r.status_code is not None
                else "unhealthy"
            ),
            latency_ms=r.latency_ms,
            last_checked_at=now,
            version=None,
            message=r.error,
            checks=r.checks,
        )
        for r in results
    ]
    return ServicesStatus(
        services=services,
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
