"""Sections C (members) and D (invitations + joinByCode)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from ..common.pagination import Page, build_page
from ..common.problem import ProblemException
from ..deps import (
    assert_course_membership,
    is_course_manager,
)
from ..repositories.invitations import InvitationRepository
from ..repositories.members import MemberRepository
from ..schemas.invitation import (
    InvitationCreate,
    InvitationRead,
    JoinByCodeRequest,
    JoinByCodeResponse,
)
from ..schemas.member import (
    BatchMemberCreate,
    BulkInviteRequest,
    BulkInviteResponse,
    MemberCreate,
    MemberRead,
    MemberRoleUpdate,
    MemberTransferGroup,
)
from ._helpers import (
    CourseDep,
    CourseSvcDep,
    SessionDep,
    UserDep,
    fetch_invitation,
    fetch_member,
    parse_cursor_id,
    parse_limit,
)

courses_member_router = APIRouter(prefix="/api/v1/courses", tags=["members"])
invites_router = APIRouter(prefix="/api/v1/courses", tags=["invitations"])
join_router = APIRouter(prefix="/api/v1", tags=["invitations"])


# ---- C. Members -----------------------------------------------------------


@courses_member_router.get("/{course_id}/members", response_model=Page[MemberRead])
async def list_members(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
    role_filter: str | None = Query(default=None, alias="role"),
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[MemberRead]:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "co_owner", "assistant", "admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    repo = MemberRepository(session)
    rows, next_id = await repo.list_members(
        course.id, role=role_filter, cursor_id=cursor_id, limit=limit
    )
    return build_page(
        [MemberRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@courses_member_router.post(
    "/{course_id}/members", response_model=MemberRead, status_code=201
)
async def add_member(
    payload: MemberCreate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> MemberRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    member = await course_svc.add_member(course, payload, user)
    return MemberRead.model_validate(member)


@courses_member_router.post(
    "/{course_id}/members:batchCreate",
    response_model=list[MemberRead],
    status_code=201,
)
async def batch_create_members(
    payload: BatchMemberCreate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> list[MemberRead]:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    rows = await course_svc.batch_add_members(course, payload, user)
    return [MemberRead.model_validate(r) for r in rows]


@courses_member_router.post(
    "/{course_id}/members:bulkInvite",
    response_model=BulkInviteResponse,
    status_code=201,
)
async def bulk_invite(
    payload: BulkInviteRequest,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> BulkInviteResponse:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    invs = await course_svc.bulk_invite(course, payload, user)
    return BulkInviteResponse(
        invitation_codes=[i.code for i in invs], created_count=len(invs)
    )


@courses_member_router.get(
    "/{course_id}/members/{user_id}", response_model=MemberRead
)
async def get_member(
    user_id: str,
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> MemberRead:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "co_owner", "admin"} and user.user_id != user_id:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    member = await fetch_member(course, user_id, session)
    return MemberRead.model_validate(member)


@courses_member_router.patch(
    "/{course_id}/members/{user_id}", response_model=MemberRead
)
async def update_member_role(
    user_id: str,
    payload: MemberRoleUpdate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> MemberRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    member = await fetch_member(course, user_id, session)
    updated = await course_svc.update_member_role(course, member, payload.role, user)
    return MemberRead.model_validate(updated)


@courses_member_router.delete(
    "/{course_id}/members/{user_id}", status_code=204
)
async def remove_member(
    user_id: str,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    member = await fetch_member(course, user_id, session)
    await course_svc.remove_member(course, member, user)
    return Response(status_code=204)


@courses_member_router.post(
    "/{course_id}/members/{user_id}:transfer-group", status_code=204
)
async def transfer_member_group(
    user_id: str,
    payload: MemberTransferGroup,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "co_owner", "assistant", "admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    member = await fetch_member(course, user_id, session)
    await course_svc.transfer_member_group(course, member, payload.target_group_id, user)
    return Response(status_code=204)


# ---- D. Invitations -------------------------------------------------------


@invites_router.get(
    "/{course_id}/invitations", response_model=Page[InvitationRead]
)
async def list_invitations(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[InvitationRead]:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    repo = InvitationRepository(session)
    rows, next_id = await repo.list(course.id, cursor_id=cursor_id, limit=limit)
    return build_page(
        [InvitationRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@invites_router.post(
    "/{course_id}/invitations", response_model=InvitationRead, status_code=201
)
async def create_invitation(
    payload: InvitationCreate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> InvitationRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    inv = await course_svc.create_invitation(course, payload, user)
    return InvitationRead.model_validate(inv)


@invites_router.get(
    "/{course_id}/invitations/{invitation_id}", response_model=InvitationRead
)
async def get_invitation(
    invitation_id: int,
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> InvitationRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    inv = await fetch_invitation(course, invitation_id, session)
    return InvitationRead.model_validate(inv)


@invites_router.delete(
    "/{course_id}/invitations/{invitation_id}", status_code=204
)
async def revoke_invitation(
    invitation_id: int,
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    inv = await fetch_invitation(course, invitation_id, session)
    repo = InvitationRepository(session)
    await repo.revoke(inv)
    return Response(status_code=204)


@join_router.post(
    "/courses:joinByCode",
    response_model=JoinByCodeResponse,
    status_code=200,
)
async def join_by_code(
    payload: JoinByCodeRequest,
    user: UserDep,
    course_svc: CourseSvcDep,
) -> JoinByCodeResponse:
    invitation, _ = await course_svc.consume_invitation(payload.code, user)
    return JoinByCodeResponse(course_id=invitation.course_id, role=invitation.role)
