"""Section E — Groups + group members."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from ..common.pagination import Page, build_page
from ..common.problem import ProblemException
from ..deps import assert_course_membership, is_course_manager
from ..repositories.groups import GroupRepository
from ..schemas.group import (
    GroupCreate,
    GroupMemberRead,
    GroupRead,
    GroupUpdate,
)
from ..schemas.member import OwnerCreate
from ._helpers import (
    CourseDep,
    CourseSvcDep,
    SessionDep,
    UserDep,
    fetch_group,
    parse_cursor_id,
    parse_limit,
)

router = APIRouter(prefix="/api/v1/courses", tags=["groups"])


@router.get("/{course_id}/groups", response_model=Page[GroupRead])
async def list_groups(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[GroupRead]:
    await assert_course_membership(course.id, user, session)
    repo = GroupRepository(session)
    rows, next_id = await repo.list(course.id, cursor_id=cursor_id, limit=limit)
    return build_page(
        [GroupRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@router.post("/{course_id}/groups", response_model=GroupRead, status_code=201)
async def create_group(
    payload: GroupCreate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> GroupRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await course_svc.create_group(course, payload)
    return GroupRead.model_validate(grp)


@router.get(
    "/{course_id}/groups/{group_id}", response_model=GroupRead
)
async def get_group(
    group_id: int,
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> GroupRead:
    await assert_course_membership(course.id, user, session)
    grp = await fetch_group(course, group_id, session)
    return GroupRead.model_validate(grp)


@router.patch(
    "/{course_id}/groups/{group_id}", response_model=GroupRead
)
async def update_group(
    group_id: int,
    payload: GroupUpdate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> GroupRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await fetch_group(course, group_id, session)
    updated = await course_svc.update_group(grp, payload)
    return GroupRead.model_validate(updated)


@router.delete("/{course_id}/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: int,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await fetch_group(course, group_id, session)
    await course_svc.delete_group(grp)
    return Response(status_code=204)


@router.get(
    "/{course_id}/groups/{group_id}/members", response_model=list[GroupMemberRead]
)
async def list_group_members(
    group_id: int,
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> list[GroupMemberRead]:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "co_owner", "assistant", "admin", "super_admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await fetch_group(course, group_id, session)
    repo = GroupRepository(session)
    rows = await repo.list_members(grp.id)
    return [GroupMemberRead.model_validate(r) for r in rows]


@router.post(
    "/{course_id}/groups/{group_id}/members",
    response_model=GroupMemberRead,
    status_code=201,
)
async def add_group_member(
    group_id: int,
    payload: OwnerCreate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> GroupMemberRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await fetch_group(course, group_id, session)
    member = await course_svc.add_group_member(grp, payload.user_id)
    return GroupMemberRead.model_validate(member)


@router.post(
    "/{course_id}/groups/{group_id}/members:batchCreate",
    response_model=list[GroupMemberRead],
    status_code=201,
)
async def batch_add_group_members(
    group_id: int,
    payload: list[OwnerCreate],
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> list[GroupMemberRead]:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await fetch_group(course, group_id, session)
    rows = await course_svc.batch_add_group_members(grp, [p.user_id for p in payload])
    return [GroupMemberRead.model_validate(r) for r in rows]


@router.delete(
    "/{course_id}/groups/{group_id}/members/{user_id}", status_code=204
)
async def remove_group_member(
    group_id: int,
    user_id: str,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    grp = await fetch_group(course, group_id, session)
    repo = GroupRepository(session)
    member = await repo.get_member(grp.id, user_id)
    if member is None:
        raise ProblemException(status_code=404, detail="Not in group", code="NOT_FOUND")
    await course_svc.remove_group_member(member)
    return Response(status_code=204)
