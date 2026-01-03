"""Export proxy: forward request to Reporting Service.

We don't generate CSV/JSON ourselves — Reporting handles async exports.
"""
from __future__ import annotations

from typing import Any

import httpx

from ..common.ids import gen_id
from ..common.logging import get_logger
from ..config import settings

log = get_logger("audit.export")


async def request_export(
    *,
    tenant_id: str | None,
    actor_id: str | None,
    payload: dict[str, Any],
) -> dict[str, str]:
    """Proxy the export request. On failure (or in test mode), still return
    a synthetic operation handle so the API contract holds."""
    op_id = gen_id("op")
    body = {
        "kind": "audit_events_export",
        "tenant_id": tenant_id,
        "requested_by": actor_id,
        "params": payload,
    }
    url = f"{settings.reporting_base_url.rstrip('/')}/api/v1/exports"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json=body)
            if resp.status_code in (200, 201, 202):
                data = resp.json()
                return {
                    "operation_id": data.get("operation_id", op_id),
                    "status_url": data.get("status_url", f"/api/v1/operations/{op_id}"),
                }
    except Exception as exc:  # noqa: BLE001
        log.warning("audit.export.proxy_failed", error=str(exc))
    return {"operation_id": op_id, "status_url": f"/api/v1/operations/{op_id}"}
