"""Outbound HTTP to Submission Service (used by manual upload)."""
from __future__ import annotations

from typing import Any, Optional

import httpx
import structlog

from integration_service.config import get_settings

logger = structlog.get_logger(__name__)


async def post_submission(
    payload: dict[str, Any],
    *,
    tenant_id: str,
    user_id: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> dict[str, Any]:
    """POST a single submission to the Submission Service. Best-effort: errors
    bubble as ``httpx.HTTPError`` for the caller to count toward ``failed``."""
    s = get_settings()
    url = s.submission_service_url.rstrip("/") + "/api/v1/submissions"
    headers = {"X-Tenant-Id": tenant_id}
    if user_id:
        headers["X-User-Id"] = user_id
    if client is None:
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as c:
            resp = await c.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()
    resp = await client.post(url, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()
