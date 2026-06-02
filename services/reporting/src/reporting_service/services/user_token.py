"""Mint a JWT 'as' a specific (tenant_id, user_id) — used by the scheduler.

Scheduled grade exports have no incoming HTTP request to crib a bearer
token from, but the grades builder needs one to call the course +
submission services (RBAC there is data-layer, with ``ensure_course_staff``
checks). The scheduler therefore asks identity-service for a JWT minted
*as* the binding's creator via ``POST /api/v1/auth/service-token`` with
``tenant_id`` + ``as_user_id`` in the body (additive extension of the
existing service-token endpoint).

Best-effort: on any failure we return ``None`` and the caller decides
how to react (the scheduler will mark the run failed with a clear
message rather than 500 the whole worker).
"""
from __future__ import annotations

import structlog
from plaglens_common.errors import PlagLensError
from plaglens_common.service_client import ServiceClient

from ..config import get_settings

logger = structlog.get_logger(__name__)


async def mint_user_token(
    *, user_id: str, tenant_id: str, role: str = "teacher"
) -> str | None:
    """Return a bare access-token string for ``(user_id, tenant_id)`` or
    ``None`` if identity-service refused. Caller wraps in ``Bearer …``.
    """
    settings = get_settings()
    try:
        async with ServiceClient(
            settings.identity_service_base_url.rstrip("/"),
            provider="identity",
            timeout=10.0,
        ) as client:
            resp = await client.post(
                "/api/v1/auth/service-token",
                headers={"X-Service-Secret": settings.service_auth_secret},
                json={
                    "service_name": "reporting-service",
                    "tenant_id": tenant_id,
                    "as_user_id": user_id,
                    "global_role": role,
                },
            )
    except PlagLensError as exc:
        # ServiceClient raises on transport failure *and* on any non-2xx
        # (mapped to a PlagLensError subclass). Both used to land us here as
        # ``return None``; keep that single best-effort path.
        logger.warning(
            "user_token.mint.failed",
            user_id=user_id,
            tenant_id=tenant_id,
            error=str(exc),
        )
        return None
    return resp.json().get("access_token")
