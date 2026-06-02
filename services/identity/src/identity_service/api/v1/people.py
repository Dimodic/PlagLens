"""Public people directory — cross-tenant search + profile card.

Distinct from the admin ``/users`` endpoints (tenant-scoped, admin/teacher
only): ``/people`` is the directory any authenticated user can browse to
find a person and open their public card (name, avatar, role, org). It
deliberately does NOT leak email or other PII, and is NOT tenant-scoped —
you can find someone in another tenant and see which courses they're in
(the courses + any submissions are composed by the gateway's profile
aggregator, gated separately)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...deps import CurrentUser, current_user, get_session
from ...models import Tenant, User
from ...repositories.users import UserRepository
from ...schemas.users import PublicProfileOut

router = APIRouter(prefix="/people", tags=["people"])


async def _tenant_map(
    session: AsyncSession, tenant_ids: set[str]
) -> dict[str, tuple[str, str]]:
    ids = {t for t in tenant_ids if t}
    if not ids:
        return {}
    rows = (
        await session.execute(
            select(Tenant.id, Tenant.name, Tenant.slug).where(Tenant.id.in_(ids))
        )
    ).all()
    return {r.id: (r.name, r.slug) for r in rows}


def _to_profile(u: User, tmap: dict[str, tuple[str, str]]) -> PublicProfileOut:
    name, slug = tmap.get(u.tenant_id, (None, None))
    display = u.display_name or (u.email.split("@")[0] if u.email else u.id)
    return PublicProfileOut(
        id=u.id,
        display_name=display,
        avatar_url=u.avatar_url,
        global_role=u.global_role,
        tenant_id=u.tenant_id,
        tenant_name=name,
        tenant_slug=slug,
        created_at=u.created_at,
    )


@router.get("", response_model=Page[PublicProfileOut], summary="Search people")
async def search_people(
    q: str = Query(..., min_length=1, max_length=120),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    _user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Page[PublicProfileOut]:
    repo = UserRepository(session)
    rows = await repo.search_people(q, limit=limit, offset=offset)
    tmap = await _tenant_map(session, {u.tenant_id for u in rows})
    return Page[PublicProfileOut](
        data=[_to_profile(u, tmap) for u in rows],
        pagination=Pagination(limit=limit, has_more=len(rows) >= limit),
    )


@router.get("/{user_id}", response_model=PublicProfileOut, summary="Public profile card")
async def get_profile_card(
    user_id: str,
    _user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> PublicProfileOut:
    repo = UserRepository(session)
    u = await repo.get(user_id)
    if u is None or u.deleted_at is not None or u.status != "active":
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    tmap = await _tenant_map(session, {u.tenant_id})
    return _to_profile(u, tmap)


__all__ = ["router"]
