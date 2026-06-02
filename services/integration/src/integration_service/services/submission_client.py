"""Outbound HTTP to Submission Service (used by manual upload)."""
from __future__ import annotations

from typing import Any, Optional

import httpx
import structlog
from plaglens_common.service_client import ServiceClient

from integration_service.config import get_settings

logger = structlog.get_logger(__name__)


async def post_submission(
    payload: dict[str, Any],
    *,
    tenant_id: str,
    user_id: Optional[str] = None,
    client: Optional[httpx.AsyncClient] = None,
) -> dict[str, Any]:
    """POST a single submission to the Submission Service.

    Best-effort: a non-2xx response or a transport error surfaces as a
    :class:`plaglens_common.errors.PlagLensError` (``UpstreamFailedError`` /
    ``UpstreamTimeoutError`` / a status-mapped subclass) for the caller to
    count toward ``failed`` — the canonical inter-service contract via
    :class:`~plaglens_common.service_client.ServiceClient` (retry +
    circuit-breaker + ``X-Request-Id`` propagation). POST is non-idempotent so
    it is never auto-retried, matching the previous raw-httpx behavior.
    """
    s = get_settings()
    base_url = s.submission_service_url.rstrip("/")
    url = base_url + "/api/v1/submissions"
    headers = {"X-Tenant-Id": tenant_id}
    if user_id:
        headers["X-User-Id"] = user_id
    sc = ServiceClient(
        base_url,
        provider="submission",
        timeout=s.httpx_timeout_seconds,
        client=client,
    )
    try:
        # Pass the absolute URL so an injected client without a ``base_url``
        # still hits the right endpoint (httpx lets an absolute URL win over
        # any configured base).
        resp = await sc.post(url, headers=headers, json=payload)
        return resp.json()
    finally:
        # Only closes the underlying client when ServiceClient owns it
        # (i.e. the caller did not inject one).
        await sc.aclose()
