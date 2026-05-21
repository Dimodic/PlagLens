"""Section J — Roles & permissions."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.problem import ProblemException
from ...common.rbac import (
    GLOBAL_ROLES,
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
from ...repositories.users import UserRepository
from ...schemas.roles import RoleAssignRequest, RoleOut, RolePermissionsOut

router = APIRouter(tags=["roles"])

_ROLE_DESCRIPTIONS = {
    "admin": "Cross-tenant platform administrator",
    "teacher": "Can create courses, owner of own courses",
    "assistant": "Course assistant (teaching helper)",
    "student": "Default role for course participants",
}


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
    summary="Permissions for a role",
)
async def get_role_permissions(
    role: str,
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> RolePermissionsOut:
    if role not in PERMISSIONS_BY_GLOBAL_ROLE:
        raise ProblemException(status=404, code="NOT_FOUND", title="Unknown role")
    return RolePermissionsOut(role=role, permissions=list_role_permissions(role))


@router.post(
    "/users/{target_user_id}/role",
    summary="Assign global role",
)
async def assign_role(
    target_user_id: str,
    payload: RoleAssignRequest,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    if payload.role not in GLOBAL_ROLES:
        raise ProblemException(
            status=422, code="VALIDATION_FAILED", title="Unknown role"
        )
    if payload.role == "admin" and user.global_role != "admin":
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Only an admin can assign the admin role"
        )
    repo = UserRepository(session)
    target = await repo.get(target_user_id)
    if target is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, target.tenant_id)
    target.global_role = payload.role
    # TODO: emit identity.user.role_assigned.v1
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
