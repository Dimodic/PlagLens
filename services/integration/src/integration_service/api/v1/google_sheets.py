"""Google Sheets endpoints (§I).

Also hosts the new tenant-level setup path used by reporting-service:

* ``POST /integrations/google-sheets/setup`` — admin pastes the service
  account JSON and we store it as an ``IntegrationConfig`` of kind
  ``google_sheets``. Replaces the old ``GOOGLE_SA_JSON`` env knob in
  reporting-service.
* ``GET /integrations/google-sheets/active-sa-json`` — service-to-service
  (``X-Service-Secret``) read-back so reporting can fetch the JSON at
  export time. Tenant-scoped, returns the most recent active config.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.google_sheets import GoogleSheetsAdapter
from integration_service.common.auth import Principal, ensure_role
from integration_service.common.ids import new_config_id, new_sheets_link_id
from integration_service.common.problems import ProblemException, not_found
from integration_service.config import get_settings
from integration_service.deps import principal_dep, session_dep
from integration_service.models import GoogleSheetsLink, IntegrationConfig
from integration_service.repositories import (
    GoogleSheetsLinkRepo,
    IntegrationConfigRepo,
)
from integration_service.schemas import (
    GoogleSheetsLinkCreate,
    GoogleSheetsLinkOut,
    GoogleSheetsLinkUpdate,
)

router = APIRouter(tags=["google-sheets"])


def _ensure_owner_or_co_owner(p: Principal, course_id: str) -> None:
    if p.is_admin or p.is_super_admin:
        return
    if p.course_role(course_id) in ("owner", "co_owner"):
        return
    raise ProblemException(403, "FORBIDDEN", "Forbidden", "owner / co_owner required")


@router.post(
    "/integrations/google-sheets/setup",
    status_code=status.HTTP_201_CREATED,
)
async def setup_google_sheets(
    payload: dict[str, Any],
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Admin pastes a Google service-account JSON; we persist it as a
    tenant-level ``IntegrationConfig`` (kind=google_sheets, status=active).

    Body shape: ``{ "display_name": "…", "sa_json": "<full JSON content>" }``.

    Replaces an existing active config for the same tenant — there's only
    one tenant-level Google sheets connection in Iteration 1 (per-teacher
    OAuth is Iteration 2).
    """
    if not (p.is_admin or p.is_super_admin):
        ensure_role(p, "admin")
    sa_raw = (payload.get("sa_json") or "").strip()
    display_name = (payload.get("display_name") or "Google Sheets").strip()
    if not sa_raw:
        raise ProblemException(
            400, "BAD_REQUEST", "Missing sa_json", "Paste the JSON content"
        )
    try:
        parsed = json.loads(sa_raw)
    except json.JSONDecodeError as exc:
        raise ProblemException(
            400,
            "BAD_REQUEST",
            "Invalid JSON",
            f"Не удалось распарсить JSON: {exc}",
        ) from exc
    # Sanity-check the SA JSON shape — Google ships ``type=service_account``
    # plus ``client_email``. Catch typos before reporting tries to use it.
    if parsed.get("type") != "service_account":
        raise ProblemException(
            400,
            "BAD_REQUEST",
            "Not a service-account JSON",
            "Ожидаю JSON с type=service_account",
        )
    if not parsed.get("client_email"):
        raise ProblemException(
            400, "BAD_REQUEST", "Missing client_email", "В JSON нет client_email"
        )

    repo = IntegrationConfigRepo(session)
    # Soft-delete any previous active google_sheets config in this tenant
    # — only one active connection at a time.
    existing = await repo.list_(
        tenant_id=p.tenant_id, kind="google_sheets", status="active"
    )
    for old in existing:
        await repo.soft_delete(old)

    cfg = IntegrationConfig(
        id=new_config_id(),
        tenant_id=p.tenant_id,
        course_id=None,
        kind="google_sheets",
        display_name=display_name,
        status="active",
        settings={
            # ``auth_mode`` distinguishes the admin SA fallback from
            # per-teacher OAuth configs (same kind, different auth path).
            # Reporting's ``sheets_sa_loader`` keys off this.
            "auth_mode": "sa",
            "sa_json": sa_raw,
            "client_email": parsed.get("client_email"),
        },
        created_by=p.user_id,
    )
    await repo.add(cfg)
    await session.commit()
    return {
        "id": cfg.id,
        "kind": cfg.kind,
        "status": cfg.status,
        "display_name": cfg.display_name,
        "client_email": parsed.get("client_email"),
    }


@router.post(
    "/integrations/google-sheets/personal-setup",
    status_code=status.HTTP_201_CREATED,
)
async def setup_personal_google_sheets(
    payload: dict[str, Any],
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Iteration 3: a teacher uploads THEIR OWN Service Account JSON. The
    resulting config is **personal** — ``created_by = the teacher``,
    ``settings.auth_mode = 'sa_personal'`` — and only that teacher's
    exports use it. Replaces the teacher's own previous personal SA
    config if one exists (one personal SA per teacher at a time).

    Open to any teacher / admin — no extra privilege required, the SA
    only acts on spreadsheets it's been shared with anyway.
    """
    if not (
        p.is_admin
        or p.is_super_admin
        or getattr(p, "global_role", None) == "teacher"
    ):
        ensure_role(p, "teacher")
    sa_raw = (payload.get("sa_json") or "").strip()
    display_name = (payload.get("display_name") or "Мой Google SA").strip()
    if not sa_raw:
        raise ProblemException(
            400, "BAD_REQUEST", "Missing sa_json", "Paste the JSON content"
        )
    try:
        parsed = json.loads(sa_raw)
    except json.JSONDecodeError as exc:
        raise ProblemException(
            400, "BAD_REQUEST", "Invalid JSON", f"Не удалось распарсить JSON: {exc}"
        ) from exc
    if parsed.get("type") != "service_account":
        raise ProblemException(
            400,
            "BAD_REQUEST",
            "Not a service-account JSON",
            "Ожидаю JSON с type=service_account",
        )
    if not parsed.get("client_email"):
        raise ProblemException(
            400, "BAD_REQUEST", "Missing client_email", "В JSON нет client_email"
        )

    repo = IntegrationConfigRepo(session)
    # Replace this teacher's previous personal SA, if any. We DON'T touch
    # the tenant-wide SA (auth_mode='sa') or anyone else's personal SA.
    for old in await repo.list_(
        tenant_id=p.tenant_id, kind="google_sheets", status="active"
    ):
        if (old.settings or {}).get("auth_mode") != "sa_personal":
            continue
        if old.created_by != p.user_id:
            continue
        await repo.soft_delete(old)

    cfg = IntegrationConfig(
        id=new_config_id(),
        tenant_id=p.tenant_id,
        course_id=None,
        kind="google_sheets",
        display_name=display_name,
        status="active",
        settings={
            "auth_mode": "sa_personal",
            "sa_json": sa_raw,
            "client_email": parsed.get("client_email"),
        },
        created_by=p.user_id,
    )
    await repo.add(cfg)
    await session.commit()
    return {
        "id": cfg.id,
        "kind": cfg.kind,
        "status": cfg.status,
        "display_name": cfg.display_name,
        "client_email": parsed.get("client_email"),
        "auth_mode": "sa_personal",
    }


@router.get("/integrations/google-sheets/personal-sa-json")
async def get_personal_sa_json(
    tenant_id: str = Query(..., min_length=1),
    user_id: str = Query(..., min_length=1),
    x_service_secret: Optional[str] = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """Service-to-service: a teacher's personal SA JSON (Iteration 3).
    Returns ``{sa_json: null}`` if the teacher hasn't uploaded their own."""
    settings = get_settings()
    if not x_service_secret or x_service_secret != settings.service_auth_secret:
        raise ProblemException(401, "UNAUTHENTICATED", "Bad service secret", None)
    from integration_service.common.db import get_sessionmaker

    sm = get_sessionmaker()
    async with sm() as session:
        repo = IntegrationConfigRepo(session)
        rows = await repo.list_(
            tenant_id=tenant_id, kind="google_sheets", status="active"
        )
    for cfg in rows:
        if (cfg.settings or {}).get("auth_mode") != "sa_personal":
            continue
        if cfg.created_by != user_id:
            continue
        return {
            "id": cfg.id,
            "sa_json": (cfg.settings or {}).get("sa_json"),
            "client_email": (cfg.settings or {}).get("client_email"),
            "display_name": cfg.display_name,
        }
    return {"id": None, "sa_json": None, "client_email": None}


@router.get("/integrations/google-sheets/teacher-token")
async def get_teacher_oauth_token(
    request: Request,
    tenant_id: str = Query(..., min_length=1),
    user_id: str = Query(..., min_length=1),
    x_service_secret: Optional[str] = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """Service-to-service: returns the teacher's Google OAuth access token
    (the one stored in Redis after a successful consent flow) when the
    teacher has connected their own Google account; otherwise empty.

    Reporting calls this on each export — prefer this token over the
    admin's tenant SA so the export runs as the teacher who initiated it.
    """
    settings = get_settings()
    if not x_service_secret or x_service_secret != settings.service_auth_secret:
        raise ProblemException(
            401, "UNAUTHENTICATED", "Bad service secret", None
        )
    from integration_service.common.db import get_sessionmaker
    from integration_service.services.oauth import get_access_token

    sm = get_sessionmaker()
    async with sm() as session:
        repo = IntegrationConfigRepo(session)
        # Pull every google_sheets config owned by this teacher in this
        # tenant. Skip the admin's SA-mode tenant-level one (course_id
        # IS NULL + ``auth_mode='sa'``) — that path lives elsewhere.
        rows = await repo.list_(
            tenant_id=tenant_id, kind="google_sheets", status="active"
        )
    for cfg in rows:
        if (cfg.settings or {}).get("auth_mode") == "sa":
            continue  # skip admin SA configs
        if cfg.created_by != user_id:
            continue
        token = await get_access_token(cfg.id)
        if not token:
            continue
        return {
            "config_id": cfg.id,
            "access_token": token,
            "display_name": cfg.display_name,
        }
    return {"config_id": None, "access_token": None}


@router.get("/integrations/google-sheets/active-sa-json")
async def get_active_google_sa(
    request: Request,
    tenant_id: str = Query(..., min_length=1),
    x_service_secret: Optional[str] = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """Service-to-service read-back: reporting-service fetches the active
    google_sheets config's SA JSON. Auth is the shared service secret —
    NOT a user JWT, because the reporting scheduler fires off-request and
    has no user context.
    """
    settings = get_settings()
    if not x_service_secret or x_service_secret != settings.service_auth_secret:
        raise ProblemException(
            401, "UNAUTHENTICATED", "Bad service secret", None
        )
    # No user context here (s2s call), so spin up a transient session via
    # the shared sessionmaker rather than going through ``session_dep``.
    from integration_service.common.db import get_sessionmaker

    sm = get_sessionmaker()
    async with sm() as session:
        repo = IntegrationConfigRepo(session)
        active = await repo.list_(
            tenant_id=tenant_id, kind="google_sheets", status="active"
        )
    # Filter to SA-mode configs — OAuth-mode (per-teacher) configs share
    # the same ``kind`` but live a different auth path.
    sa_only = [
        cfg for cfg in active if (cfg.settings or {}).get("auth_mode") == "sa"
    ]
    if not sa_only:
        return {"sa_json": None, "client_email": None}
    cfg = sa_only[0]
    return {
        "id": cfg.id,
        "sa_json": (cfg.settings or {}).get("sa_json"),
        "client_email": (cfg.settings or {}).get("client_email"),
        "display_name": cfg.display_name,
    }


@router.get("/integrations/google-sheets/spreadsheets")
async def list_spreadsheets(
    p: Principal = Depends(principal_dep),
) -> dict[str, Any]:
    if not p.is_admin and not p.is_super_admin:
        ensure_role(p, "admin")
    adapter = GoogleSheetsAdapter()
    items = await adapter.list_spreadsheets()
    return {"data": items}


@router.post(
    "/courses/{course_id}/google-sheets/link",
    response_model=GoogleSheetsLinkOut,
    status_code=status.HTTP_201_CREATED,
)
async def link_sheet(
    course_id: str,
    payload: GoogleSheetsLinkCreate,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> GoogleSheetsLinkOut:
    _ensure_owner_or_co_owner(p, course_id)
    repo = GoogleSheetsLinkRepo(session)
    existing = await repo.get_by_course(course_id)
    if existing is not None:
        raise ProblemException(409, "CONFLICT", "Conflict", "course is already linked")
    link = GoogleSheetsLink(
        id=new_sheets_link_id(),
        course_id=course_id,
        tenant_id=p.tenant_id,
        spreadsheet_id=payload.spreadsheet_id,
        sheet_name=payload.sheet_name,
        columns_mapping=payload.columns_mapping or {},
        created_by=p.user_id,
    )
    await repo.add(link)
    await session.commit()
    return GoogleSheetsLinkOut.model_validate(link)


@router.get("/courses/{course_id}/google-sheets/link", response_model=GoogleSheetsLinkOut)
async def get_link(
    course_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> GoogleSheetsLinkOut:
    if p.course_role(course_id) not in ("owner", "co_owner", "assistant") and not p.is_admin and not p.is_super_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "owner / co_owner / assistant required")
    repo = GoogleSheetsLinkRepo(session)
    link = await repo.get_by_course(course_id)
    if link is None:
        raise not_found("GoogleSheetsLink", course_id)
    return GoogleSheetsLinkOut.model_validate(link)


@router.patch("/courses/{course_id}/google-sheets/link", response_model=GoogleSheetsLinkOut)
async def patch_link(
    course_id: str,
    payload: GoogleSheetsLinkUpdate,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> GoogleSheetsLinkOut:
    _ensure_owner_or_co_owner(p, course_id)
    repo = GoogleSheetsLinkRepo(session)
    link = await repo.get_by_course(course_id)
    if link is None:
        raise not_found("GoogleSheetsLink", course_id)
    if payload.spreadsheet_id is not None:
        link.spreadsheet_id = payload.spreadsheet_id
    if payload.sheet_name is not None:
        link.sheet_name = payload.sheet_name
    if payload.columns_mapping is not None:
        link.columns_mapping = payload.columns_mapping
    link.updated_at = datetime.now(UTC)
    await session.commit()
    return GoogleSheetsLinkOut.model_validate(link)


@router.delete("/courses/{course_id}/google-sheets/link", status_code=status.HTTP_204_NO_CONTENT)
async def delete_link(
    course_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> Response:
    _ensure_owner_or_co_owner(p, course_id)
    repo = GoogleSheetsLinkRepo(session)
    link = await repo.get_by_course(course_id)
    if link is None:
        raise not_found("GoogleSheetsLink", course_id)
    await repo.delete(link)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/courses/{course_id}/google-sheets/link:validate")
async def validate_link(
    course_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    _ensure_owner_or_co_owner(p, course_id)
    repo = GoogleSheetsLinkRepo(session)
    link = await repo.get_by_course(course_id)
    if link is None:
        raise not_found("GoogleSheetsLink", course_id)
    adapter = GoogleSheetsAdapter()
    res = await adapter.validate_access(link.spreadsheet_id)
    return {"ok": res.ok, "detail": res.detail, "metadata": res.metadata}
