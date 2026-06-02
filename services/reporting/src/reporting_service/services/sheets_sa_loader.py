"""Fetch the tenant's Google Sheets service-account JSON from
integration-service and build a one-off ``GoogleApiClient`` for an export.

Why per-call: the SA lives on an ``IntegrationConfig`` of kind
``google_sheets`` owned by the admin (see
``integration_service/api/v1/google_sheets.py::setup_google_sheets``). The
reporting service has no idea who's calling until a request lands, and
we don't want to keep a stale long-lived client per tenant either — a
60-second in-memory TTL on the JSON keeps load light without making
config rotation painful.

Service-to-service auth is the shared ``service_auth_secret`` (no user
context for scheduled cron runs).
"""
from __future__ import annotations

import time
from typing import Any

import structlog
from plaglens_common.errors import (
    PlagLensError,
    UpstreamFailedError,
    UpstreamTimeoutError,
)
from plaglens_common.service_client import ServiceClient

from ..config import get_settings
from ..exports.formats.google_sheets import GoogleApiClient

logger = structlog.get_logger(__name__)

# Per-tenant cache: ``tenant_id`` → (expires_at_unix, sa_json or None).
# ``None`` means we've already asked and the tenant has no active config —
# the negative cache keeps the s2s spam down when a teacher opens the
# Sheets target without a configured integration.
_CACHE_TTL_S = 60.0
_cache: dict[str, tuple[float, str | None, str | None]] = {}


async def _fetch_sa_json(
    tenant_id: str,
) -> tuple[str | None, str | None]:
    """Hit integration-service's s2s endpoint. Returns ``(sa_json,
    client_email)``; both ``None`` when the tenant has no config or the
    call fails."""
    settings = get_settings()
    try:
        async with ServiceClient(
            settings.integration_service_base_url.rstrip("/"),
            provider="integration",
            timeout=8.0,
        ) as client:
            r = await client.get(
                "/api/v1/integrations/google-sheets/active-sa-json",
                params={"tenant_id": tenant_id},
                headers={"X-Service-Secret": settings.service_auth_secret},
            )
    except PlagLensError as exc:
        # ServiceClient raises on transport failure *and* any non-2xx
        # (e.g. tenant has no config). Both used to return (None, None).
        logger.warning(
            "sheets_sa.fetch_failed", tenant_id=tenant_id, error=str(exc)
        )
        return None, None
    body: dict[str, Any] = r.json()
    return body.get("sa_json"), body.get("client_email")


async def get_tenant_sa_json(
    tenant_id: str,
) -> tuple[str | None, str | None]:
    """Return the cached or freshly-fetched ``(sa_json, client_email)``
    pair for a tenant. ``(None, None)`` = no active config."""
    now = time.monotonic()
    cached = _cache.get(tenant_id)
    if cached and cached[0] > now:
        return cached[1], cached[2]
    sa_json, client_email = await _fetch_sa_json(tenant_id)
    _cache[tenant_id] = (now + _CACHE_TTL_S, sa_json, client_email)
    return sa_json, client_email


async def _fetch_teacher_oauth_token(
    tenant_id: str, user_id: str
) -> str | None:
    """Ask integration-service for the teacher's Google OAuth access token
    (set after a successful consent flow on a per-user google_sheets
    config). Returns ``None`` when the teacher hasn't connected their
    own account — caller falls back to the admin SA."""
    settings = get_settings()
    try:
        async with ServiceClient(
            settings.integration_service_base_url.rstrip("/"),
            provider="integration",
            timeout=8.0,
        ) as client:
            r = await client.get(
                "/api/v1/integrations/google-sheets/teacher-token",
                params={"tenant_id": tenant_id, "user_id": user_id},
                headers={"X-Service-Secret": settings.service_auth_secret},
            )
    except (UpstreamFailedError, UpstreamTimeoutError) as exc:
        # Transport / upstream failure (was the ``httpx.HTTPError`` branch).
        logger.warning(
            "teacher_oauth.fetch_failed",
            tenant_id=tenant_id,
            user_id=user_id,
            error=str(exc),
        )
        return None
    except PlagLensError:
        # A plain non-2xx (e.g. 404 — teacher hasn't connected). Stays
        # silent, exactly as the old ``status_code >= 400`` branch did.
        return None
    return r.json().get("access_token")


async def _fetch_personal_sa_json(
    tenant_id: str, user_id: str
) -> str | None:
    """Iteration 3: a teacher's personal Service Account JSON (uploaded
    via ``personal-setup``). Returns ``None`` if they haven't."""
    settings = get_settings()
    try:
        async with ServiceClient(
            settings.integration_service_base_url.rstrip("/"),
            provider="integration",
            timeout=8.0,
        ) as client:
            r = await client.get(
                "/api/v1/integrations/google-sheets/personal-sa-json",
                params={"tenant_id": tenant_id, "user_id": user_id},
                headers={"X-Service-Secret": settings.service_auth_secret},
            )
    except (UpstreamFailedError, UpstreamTimeoutError) as exc:
        # Transport / upstream failure (was the ``httpx.HTTPError`` branch).
        logger.warning(
            "personal_sa.fetch_failed",
            tenant_id=tenant_id,
            user_id=user_id,
            error=str(exc),
        )
        return None
    except PlagLensError:
        # Plain non-2xx (teacher has no personal SA) — silent, as before.
        return None
    return r.json().get("sa_json")


async def get_sheets_client_for_user(
    tenant_id: str, user_id: str
) -> GoogleApiClient | None:
    """Build a Google Sheets client for ``(tenant_id, user_id)``,
    walking a 3-step preference chain: teacher OAuth (Iter 2) →
    teacher's personal SA (Iter 3) → admin's tenant SA (Iter 1).
    Returns ``None`` when none of them produce working credentials.
    """
    # 1. Teacher's per-user OAuth (most natural — they consented).
    token = await _fetch_teacher_oauth_token(tenant_id, user_id)
    if token:
        client = GoogleApiClient(access_token=token)
        if getattr(client, "_impl", None) is not None:
            return client
    # 2. Teacher's own SA JSON (team service account, scripted access…).
    personal = await _fetch_personal_sa_json(tenant_id, user_id)
    if personal:
        client = GoogleApiClient(personal)
        if getattr(client, "_impl", None) is not None:
            return client
    # 3. Admin's tenant SA fallback (everybody shares one).
    return await get_sheets_client_for_tenant(tenant_id)


async def get_sheets_client_for_tenant(
    tenant_id: str,
) -> GoogleApiClient | None:
    """Build a fresh ``GoogleApiClient`` for ``tenant_id``, or ``None``
    when the tenant has no Google Sheets integration configured **or the
    stored SA JSON couldn't be turned into real credentials** (bad key,
    deactivated SA, missing libs). Returning ``None`` over a silent
    InMemory stub keeps the UI honest — empty preview from a stub looked
    like a working integration.
    """
    sa_json, _ = await get_tenant_sa_json(tenant_id)
    if not sa_json:
        return None
    client = GoogleApiClient(sa_json)
    # ``_impl`` is the real google-api-python-client; if it's None the
    # constructor fell back to InMemory (creds bad / google libs missing).
    if getattr(client, "_impl", None) is None:
        logger.warning(
            "sheets_sa.creds_invalid",
            tenant_id=tenant_id,
            note="Stored SA JSON didn't parse into real Google credentials.",
        )
        return None
    return client


def invalidate_tenant(tenant_id: str) -> None:
    """Drop the cache entry so the next call re-reads from integration.
    Use after admin saves a new SA — without it the old client sticks
    around for up to 60 s."""
    _cache.pop(tenant_id, None)
