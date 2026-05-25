"""Integration Configs CRUD + lifecycle actions (§A)."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters import get_adapter
from integration_service.common.auth import Principal
from integration_service.common.ids import new_config_id
from integration_service.common.kafka_bus import KafkaBus
from integration_service.common.problems import ProblemException, not_found
from integration_service.config import get_settings
from integration_service.deps import bus_dep, principal_dep, session_dep
from integration_service.models import IntegrationConfig
from integration_service.repositories import IntegrationConfigRepo
from integration_service.schemas import (
    IntegrationConfigCreate,
    IntegrationConfigCreateResponse,
    IntegrationConfigOut,
    IntegrationConfigUpdate,
    Page,
    Pagination,
    TestConnectionResult,
)
from integration_service.services import idempotency
from integration_service.services.oauth import (
    build_authorize_url,
    create_state,
    get_provider_for_tenant,
)

router = APIRouter(prefix="/integrations", tags=["integrations"])


def _to_dto(cfg: IntegrationConfig) -> IntegrationConfigOut:
    return IntegrationConfigOut.model_validate(cfg)


def _ensure_owner_or_admin(p: Principal, course_id: Optional[str]) -> None:
    if p.is_admin or p.is_super_admin:
        return
    if course_id is None:
        # Tenant-wide integration (no course attached yet). Teachers
        # routinely set up shared providers (Y.Contest creds, Stepik
        # OAuth, Sheets) up front and link courses to them later from
        # the integration's detail page, so the global "teacher" role
        # is enough — there's no course-level owner check we could
        # apply here anyway. The previous code required full admin and
        # surfaced as a confusing 403 right after "+ Подключить".
        if getattr(p, "global_role", None) in ("teacher", "admin"):
            return
        raise ProblemException(
            403, "FORBIDDEN", "Forbidden", "teacher / admin required"
        )
    # JWT carries `course_roles` only when the identity service actively
    # populates it; right now those are empty by default, so we fall back to
    # the global role: any teacher can create/manage integrations and the
    # actual privileged action downstream (course-service `:batchCreate`,
    # submission-service writes, etc.) re-checks ownership there. Pure
    # students still get rejected here.
    if p.course_role(course_id) in ("owner", "co_owner"):
        return
    if getattr(p, "global_role", None) == "teacher":
        return
    raise ProblemException(403, "FORBIDDEN", "Forbidden", "owner / co_owner required")


@router.get("", response_model=Page[IntegrationConfigOut])
async def list_configs(
    course_id: Optional[str] = Query(default=None),
    kind: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> Page[IntegrationConfigOut]:
    repo = IntegrationConfigRepo(session)
    rows = await repo.list_(
        tenant_id=p.tenant_id,
        course_id=course_id,
        kind=kind,
        status=status_filter,
        limit=limit,
    )
    return Page[IntegrationConfigOut](
        data=[_to_dto(r) for r in rows],
        pagination=Pagination(next_cursor=None, has_more=False, limit=limit),
    )


@router.post(
    "",
    response_model=IntegrationConfigCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_config(
    payload: IntegrationConfigCreate,
    response: Response,
    idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> IntegrationConfigCreateResponse:
    # Special case: a teacher connecting THEIR OWN Google account via
    # OAuth doesn't need course-owner or admin rights — the resulting
    # config is private (per-user, no course_id, auth_mode=oauth) and
    # only their own exports see its token. Everything else still goes
    # through the regular owner/admin gate.
    is_personal_google = (
        payload.kind.value == "google_sheets"
        and payload.course_id is None
        and (payload.settings or {}).get("auth_mode") == "oauth"
    )
    if not is_personal_google:
        _ensure_owner_or_admin(p, payload.course_id)
    elif not (
        getattr(p, "global_role", None) in ("teacher", "admin")
        or p.is_admin
        or p.is_super_admin
    ):
        raise ProblemException(
            403, "FORBIDDEN", "Forbidden", "teacher / admin required"
        )

    body = payload.model_dump(mode="json")
    cached, conflict = await idempotency.get_cached_response(p.tenant_id, idempotency_key or "", body)
    if conflict:
        raise ProblemException(
            409, "IDEMPOTENCY_KEY_CONFLICT", "Conflict", "key reused with different body"
        )
    if cached:
        return IntegrationConfigCreateResponse(**cached)

    cfg = IntegrationConfig(
        id=new_config_id(),
        tenant_id=p.tenant_id,
        course_id=payload.course_id,
        kind=payload.kind.value,
        display_name=payload.display_name,
        status=(
            "pending_auth"
            if payload.kind.value in ("stepik", "yandex_contest", "google_sheets")
            and (payload.settings or {}).get("auth_mode") != "sa"
            else "active"
        ),
        settings=payload.settings or {},
        created_by=p.user_id,
    )
    repo = IntegrationConfigRepo(session)
    await repo.add(cfg)
    await session.commit()

    oauth_url: Optional[str] = None
    if cfg.kind in ("stepik", "yandex_contest", "google_sheets") and (
        cfg.settings or {}
    ).get("auth_mode") != "sa":
        provider = await get_provider_for_tenant(cfg.kind, cfg.tenant_id, cfg)
        if provider and provider.client_id:
            state = await create_state(cfg.id, p.tenant_id)
            oauth_url = build_authorize_url(provider, state)

    s = get_settings()
    response.headers["Location"] = f"{s.api_prefix}/integrations/{cfg.id}"

    await bus.publish(
        s.kafka_topic_integration_config,
        "integration.config.created.v1",
        {"config_id": cfg.id, "kind": cfg.kind, "course_id": cfg.course_id},
        tenant_id=p.tenant_id,
        actor={"type": "user", "id": p.user_id},
    )
    out = IntegrationConfigCreateResponse(config=_to_dto(cfg), oauth_authorize_url=oauth_url)
    if idempotency_key:
        await idempotency.store_response(p.tenant_id, idempotency_key, body, out.model_dump(mode="json"))
    return out


@router.get("/{config_id}", response_model=IntegrationConfigOut)
async def get_config(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> IntegrationConfigOut:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    _ensure_owner_or_admin(p, cfg.course_id)
    return _to_dto(cfg)


@router.patch("/{config_id}", response_model=IntegrationConfigOut)
async def update_config(
    config_id: str,
    payload: IntegrationConfigUpdate,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> IntegrationConfigOut:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    _ensure_owner_or_admin(p, cfg.course_id)
    if payload.display_name is not None:
        cfg.display_name = payload.display_name
    if payload.settings is not None:
        cfg.settings = payload.settings
    if payload.status is not None:
        cfg.status = payload.status.value
    cfg.updated_at = datetime.now(UTC)
    await session.commit()
    await bus.publish(
        get_settings().kafka_topic_integration_config,
        "integration.config.updated.v1",
        {"config_id": cfg.id},
        tenant_id=p.tenant_id,
        actor={"type": "user", "id": p.user_id},
    )
    return _to_dto(cfg)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> Response:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    if False:  # delegate to _ensure_owner_or_admin
        pass
    _ensure_owner_or_admin(p, cfg.course_id)
    if False:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "owner or admin required")
    await repo.soft_delete(cfg)
    await session.commit()
    await bus.publish(
        get_settings().kafka_topic_integration_config,
        "integration.config.deleted.v1",
        {"config_id": cfg.id},
        tenant_id=p.tenant_id,
        actor={"type": "user", "id": p.user_id},
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{config_id}:test", response_model=TestConnectionResult)
async def test_connection(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> TestConnectionResult:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    _ensure_owner_or_admin(p, cfg.course_id)
    adapter = get_adapter(cfg.kind)
    result = await adapter.test_connection(cfg)
    return TestConnectionResult(ok=result.ok, detail=result.detail, metadata=result.metadata)


@router.post("/{config_id}:enable", response_model=IntegrationConfigOut)
async def enable_config(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> IntegrationConfigOut:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    if False:  # delegate to _ensure_owner_or_admin
        pass
    _ensure_owner_or_admin(p, cfg.course_id)
    if False:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "owner or admin required")
    cfg.status = "active"
    cfg.updated_at = datetime.now(UTC)
    await session.commit()
    return _to_dto(cfg)


@router.post("/{config_id}:disable", response_model=IntegrationConfigOut)
async def disable_config(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> IntegrationConfigOut:
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    if False:  # delegate to _ensure_owner_or_admin
        pass
    _ensure_owner_or_admin(p, cfg.course_id)
    if False:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "owner or admin required")
    cfg.status = "disabled"
    cfg.updated_at = datetime.now(UTC)
    await session.commit()
    return _to_dto(cfg)


# Convenience: a hook for other routers that need ownership-check on configs.
def ensure_owner_or_admin(p: Principal, course_id: Optional[str]) -> None:
    _ensure_owner_or_admin(p, course_id)


__all__ = ["router", "ensure_owner_or_admin"]
_ = Any  # keep typing import in use
