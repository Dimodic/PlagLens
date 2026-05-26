"""Admin / stats / DLQ (§L)."""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.auth import Principal
from integration_service.common.problems import ProblemException
from integration_service.config import get_settings
from integration_service.deps import principal_dep, session_dep
from integration_service.repositories import (
    ImportJobRepo,
    IntegrationConfigRepo,
    WebhookEventRepo,
)
from integration_service.repositories.oauth_apps import OAuthAppCredentialsRepo
from integration_service.schemas import ImportJobOut, WebhookEventOut

router = APIRouter(prefix="/admin/integrations", tags=["admin"])


def _ensure_admin(p: Principal) -> None:
    if not p.is_admin and not p.is_super_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "admin required")


@router.get("/health")
async def admin_health(
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    _ensure_admin(p)
    repo = IntegrationConfigRepo(session)
    rows = await repo.list_(tenant_id=p.tenant_id, limit=200)
    by_status: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        by_kind[r.kind] = by_kind.get(r.kind, 0) + 1
    return {"total": len(rows), "by_status": by_status, "by_kind": by_kind}


@router.get("/webhook-events")
async def list_webhook_events(
    kind: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    _ensure_admin(p)
    repo = WebhookEventRepo(session)
    rows = await repo.list_recent(tenant_id=p.tenant_id, kind=kind, limit=limit)
    return {"data": [WebhookEventOut.model_validate(r).model_dump() for r in rows]}


@router.get("/dlq")
async def list_dlq(
    limit: int = 50,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    _ensure_admin(p)
    repo = ImportJobRepo(session)
    rows = await repo.list_failed_for_tenant(p.tenant_id, limit=limit)
    return {"data": [ImportJobOut.model_validate(r).model_dump() for r in rows]}


# -------- OAuth app credentials (admin) --------

# Known OAuth providers users can configure. The ``provider_kind`` MUST
# match the ``IntegrationConfig.kind`` value used by the corresponding
# integration — that's how ``services/oauth.py::_from_db`` finds the
# right creds when the per-config OAuth flow kicks off.
_KNOWN_PROVIDERS = {"yandex_contest", "stepik", "google_sheets"}

# Per-provider static metadata. ``default_redirect_uri`` is built at
# request time from ``settings.frontend_base_url`` so deploys see their
# real public host (https://example.com/…) instead of the dev-default
# http://localhost:5173 baked in at import time.
_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "yandex_contest": {
        "title": "Yandex.Contest",
        "register_url": "https://oauth.yandex.ru/client/new",
        "default_scope": "contest:manage",
    },
    "stepik": {
        "title": "Stepik",
        "register_url": "https://stepik.org/oauth2/applications/",
        "default_scope": "read",
    },
    "google_sheets": {
        "title": "Google Sheets",
        "register_url": "https://console.cloud.google.com/apis/credentials",
        "default_scope": "https://www.googleapis.com/auth/spreadsheets",
    },
}


def _default_redirect_uri() -> str:
    base = get_settings().frontend_base_url.rstrip("/")
    return f"{base}/integrations/oauth/callback"


def _provider_view(kind: str, row: Any) -> dict[str, Any]:
    meta = _PROVIDER_DEFAULTS.get(kind, {})
    return {
        "provider_kind": kind,
        "title": meta.get("title", kind),
        "register_url": meta.get("register_url"),
        "default_scope": meta.get("default_scope"),
        "default_redirect_uri": _default_redirect_uri(),
        "configured": row is not None,
        # Never return the secret. Show only that it's set.
        "client_id": row.client_id if row else None,
        "client_secret_set": bool(row and row.client_secret),
        "redirect_uri": row.redirect_uri if row else None,
        "scope": row.scope if row else None,
        "updated_at": row.updated_at.isoformat() if row else None,
    }


class OAuthCredentialsUpsert(BaseModel):
    client_id: str = Field(min_length=1, max_length=255)
    client_secret: str = Field(min_length=1, max_length=255)
    redirect_uri: str = Field(min_length=1, max_length=500)
    scope: Optional[str] = Field(default=None, max_length=500)


@router.get("/oauth-providers")
async def list_oauth_providers(
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """List every known OAuth provider for the current tenant, marked as
    configured/not configured. Admin only."""
    _ensure_admin(p)
    repo = OAuthAppCredentialsRepo(session)
    rows = await repo.list_for_tenant(p.tenant_id)
    by_kind = {r.provider_kind: r for r in rows}
    data = [_provider_view(kind, by_kind.get(kind)) for kind in _KNOWN_PROVIDERS]
    # Stable order: configured providers first.
    data.sort(key=lambda d: (not d["configured"], d["provider_kind"]))
    return {"data": data}


@router.get("/oauth-providers/{kind}")
async def get_oauth_provider(
    kind: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    _ensure_admin(p)
    if kind not in _KNOWN_PROVIDERS:
        raise ProblemException(404, "NOT_FOUND", "Unknown provider", kind)
    repo = OAuthAppCredentialsRepo(session)
    row = await repo.get(p.tenant_id, kind)
    return _provider_view(kind, row)


@router.put("/oauth-providers/{kind}")
async def upsert_oauth_provider(
    kind: str,
    payload: OAuthCredentialsUpsert,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Create or replace OAuth app credentials for a provider. Admin only."""
    _ensure_admin(p)
    if kind not in _KNOWN_PROVIDERS:
        raise ProblemException(404, "NOT_FOUND", "Unknown provider", kind)
    repo = OAuthAppCredentialsRepo(session)
    row = await repo.upsert(
        tenant_id=p.tenant_id,
        provider_kind=kind,
        client_id=payload.client_id.strip(),
        client_secret=payload.client_secret.strip(),
        redirect_uri=payload.redirect_uri.strip(),
        scope=(payload.scope or "").strip() or None,
        created_by=p.user_id,
    )
    await session.commit()
    return _provider_view(kind, row)


@router.delete("/oauth-providers/{kind}", status_code=204)
async def delete_oauth_provider(
    kind: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> None:
    _ensure_admin(p)
    if kind not in _KNOWN_PROVIDERS:
        raise ProblemException(404, "NOT_FOUND", "Unknown provider", kind)
    repo = OAuthAppCredentialsRepo(session)
    await repo.delete(p.tenant_id, kind)
    await session.commit()
