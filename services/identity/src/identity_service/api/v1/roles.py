"""Section J — Roles & permissions."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import publish_user_event
from ...common.problem import ProblemException
from ...common.rbac import (
    GLOBAL_ROLES,
    PERMISSION_CATALOGUE,
    PERMISSIONS_BY_GLOBAL_ROLE,
    list_role_permissions,
)
from ...deps import (
    CurrentUser,
    assert_same_tenant,
    current_user,
    get_session,
    require_global_role,
)
from ...models import RolePermission
from ...repositories.users import UserRepository
from ...schemas.roles import (
    PermissionOut,
    RoleAssignRequest,
    RoleOut,
    RolePermissionsOut,
    RolePermissionsUpdate,
)

router = APIRouter(tags=["roles"])

_ROLE_DESCRIPTIONS = {
    "admin": "Cross-tenant platform administrator",
    "teacher": "Can create courses, owner of own courses",
    "assistant": "Course assistant (teaching helper)",
    "student": "Default role for course participants",
}


@router.get(
    "/permissions",
    response_model=list[PermissionOut],
    summary="Permission catalogue (matrix rows)",
)
async def list_permissions(
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> list[PermissionOut]:
    return [
        PermissionOut(permission=key, description=desc)
        for key, desc in PERMISSION_CATALOGUE.items()
    ]


@router.get("/roles", response_model=list[RoleOut], summary="List global roles")
async def list_roles(
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> list[RoleOut]:
    return [
        RoleOut(role=r, description=_ROLE_DESCRIPTIONS.get(r))
        for r in GLOBAL_ROLES
    ]


@router.get(
    "/roles/{role}/permissions",
    response_model=RolePermissionsOut,
    summary="Permissions for a role (DB overrides, else defaults)",
)
async def get_role_permissions(
    role: str,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> RolePermissionsOut:
    if role not in PERMISSIONS_BY_GLOBAL_ROLE:
        raise ProblemException(status=404, code="NOT_FOUND", title="Unknown role")
    rows = (
        await session.execute(
            select(RolePermission).where(RolePermission.role == role)
        )
    ).scalars().all()
    if rows:
        perms = sorted(r.permission for r in rows if r.granted)
    else:
        perms = list_role_permissions(role)
    return RolePermissionsOut(role=role, permissions=perms)


@router.patch(
    "/roles/{role}/permissions",
    response_model=RolePermissionsOut,
    summary="Replace the permissions granted to a role",
)
async def update_role_permissions(
    role: str,
    payload: RolePermissionsUpdate,
    session: AsyncSession = Depends(get_session),
    user: CurrentUser = Depends(require_global_role("admin")),  # noqa: ARG001
) -> RolePermissionsOut:
    if role not in PERMISSIONS_BY_GLOBAL_ROLE:
        raise ProblemException(status=404, code="NOT_FOUND", title="Unknown role")
    granted = {p for p in payload.permissions if p in PERMISSION_CATALOGUE}
    # Store an explicit row per catalogue permission so the role's stored set is
    # authoritative afterwards (including "everything unchecked").
    await session.execute(delete(RolePermission).where(RolePermission.role == role))
    for perm in PERMISSION_CATALOGUE:
        session.add(
            RolePermission(role=role, permission=perm, granted=perm in granted)
        )
    await session.flush()
    return RolePermissionsOut(role=role, permissions=sorted(granted))


@router.post(
    "/users/{target_user_id}/role",
    summary="Assign global role",
)
async def assign_role(
    target_user_id: str,
    payload: RoleAssignRequest,
    request: Request,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    if payload.role not in GLOBAL_ROLES:
        raise ProblemException(
            status=422, code="VALIDATION_FAILED", title="Unknown role"
        )
    repo = UserRepository(session)
    target = await repo.get(target_user_id)
    if target is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, target.tenant_id)
    previous_role = target.global_role
    target.global_role = payload.role
    await publish_user_event(
        request,
        "identity.user.role_assigned.v1",
        data={
            "user_id": target.id,
            "previous_role": previous_role,
            "new_role": target.global_role,
            "actor_user_id": user.id,
        },
        tenant_id=target.tenant_id,
        subject=f"users/{target.id}",
        actor={"user_id": user.id, "global_role": user.global_role},
    )
    return {"user_id": target.id, "global_role": target.global_role}


@router.get(
    "/users/{target_user_id}/course-roles",
    summary="Course roles of a user (proxy to Course Service)",
)
async def user_course_roles(
    target_user_id: str,  # noqa: ARG001
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> dict[str, dict[str, str]]:
    # TODO: cross-call Course Service for full set
    return {"course_roles": {}}
