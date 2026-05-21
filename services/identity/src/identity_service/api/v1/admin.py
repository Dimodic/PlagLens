"""Section M — Cross-tenant admin endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...deps import CurrentUser, get_session, require_global_role
from ...repositories.tenants import TenantRepository
from ...repositories.users import UserRepository
from ...schemas.tenants import TenantOut
from ...schemas.users import UserOut
from .tenants import _tenant_to_out
from .users import _user_to_out

router = APIRouter(prefix="/admin", tags=["admin"])


class CrossTenantMigrate(BaseModel):
    user_id: str
    target_tenant_id: str


@router.get(
    "/tenants",
    response_model=Page[TenantOut],
    summary="List tenants (alias for /tenants, super_admin)",
)
async def admin_list_tenants(
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_global_role("admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> Page[TenantOut]:
    repo = TenantRepository(session)
    rows = await repo.list(limit=limit, offset=0)
    return Page[TenantOut](
        data=[_tenant_to_out(t) for t in rows],
        pagination=Pagination(limit=limit, has_more=False, next_cursor=None),
    )


@router.get(
    "/users",
    response_model=Page[UserOut],
    summary="Cross-tenant user search",
)
async def admin_list_users(
    q: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_global_role("admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> Page[UserOut]:
    repo = UserRepository(session)
    rows = await repo.list(tenant_id=None, q=q, limit=limit)
    return Page[UserOut](
        data=[_user_to_out(u) for u in rows],
        pagination=Pagination(limit=limit, has_more=False, next_cursor=None),
    )


@router.post(
    "/cross-tenant/migrate-user",
    summary="Migrate user across tenants (super_admin)",
)
async def cross_tenant_migrate_user(
    payload: CrossTenantMigrate,  # noqa: ARG001 — TODO use payload to perform migration
    user: CurrentUser = Depends(require_global_role("admin")),  # noqa: ARG001
) -> dict[str, str]:
    raise ProblemException(
        status=501,
        code="NOT_IMPLEMENTED",
        title="Cross-tenant migration is not yet wired",
        detail="Real data movement requires coordinating with downstream services.",
    )
