"""Section A — Courses + B — Course owners + course dashboard.

All paths are mounted under ``/api/v1`` by the parent ``main.py``.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status

from ..common.pagination import Page, build_page
from ..common.problem import ProblemException
from ..deps import assert_course_membership, is_course_manager
from ..repositories.courses import CourseRepository
from ..repositories.members import MemberRepository
from ..schemas.course import (
    CourseCreate,
    CourseDuplicate,
    CourseRead,
    CourseUpdate,
    DashboardSummary,
)
from ..schemas.member import OwnerCreate, OwnerRead
from ._helpers import (
    AssignmentSvcDep,
    CourseDep,
    CourseSvcDep,
    SessionDep,
    UserDep,
    parse_cursor_id,
    parse_limit,
)

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])

_OWNER_LIKE = {"owner", "co_owner", "admin"}
_MANAGER_LIKE = _OWNER_LIKE | {"assistant"}


# ---- A. Courses -----------------------------------------------------------


@router.get("", response_model=Page[CourseRead])
async def list_courses(
    user: UserDep,
    session: SessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    owner_id: str | None = Query(default=None),
    member_id: str | None = Query(default=None),
    q: str | None = Query(default=None, max_length=255),
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
    include_deleted: bool = Query(default=False),
) -> Page[CourseRead]:
    if include_deleted and user.global_role not in {"admin"}:
        raise ProblemException(
            status_code=403,
            detail="include_deleted requires admin",
            code="FORBIDDEN",
        )
    repo = CourseRepository(session)
    if user.global_role in {"admin"}:
        # A global admin *searching* (q present) spans ALL tenants — they
        # manage the whole platform, so ⌘K / global search must find courses
        # outside their own tenant. Browsing without a query stays scoped to
        # their tenant so the admin course list isn't flooded cross-tenant.
        rows, next_id = await repo.list_for_tenant(
            None if q else user.tenant_id,
            status=status_filter,
            owner_id=owner_id,
            member_id=member_id,
            q=q,
            cursor_id=cursor_id,
            limit=limit,
            include_deleted=include_deleted,
        )
    else:
        rows, next_id = await repo.list_courses_for_user(
            user.user_id,
            user.tenant_id,
            status=status_filter,
            q=q,
            cursor_id=cursor_id,
            limit=limit,
        )
    return build_page(
        [CourseRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@router.post("", response_model=CourseRead, status_code=201)
async def create_course(
    payload: CourseCreate,
    response: Response,
    user: UserDep,
    course_svc: CourseSvcDep,
) -> CourseRead:
    if user.global_role not in {"admin", "teacher"}:
        raise ProblemException(
            status_code=403,
            detail="Only teacher/admin can create courses",
            code="FORBIDDEN",
        )
    course = await course_svc.create_course(payload, user)
    response.headers["Location"] = f"/api/v1/courses/{course.id}"
    return CourseRead.model_validate(course)


@router.get("/{course_id}", response_model=CourseRead)
async def get_course(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> CourseRead:
    await assert_course_membership(course.id, user, session)
    return CourseRead.model_validate(course)


@router.patch("/{course_id}", response_model=CourseRead)
async def update_course(
    payload: CourseUpdate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> CourseRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(
            status_code=403, detail="Only owner / co_owner can update", code="FORBIDDEN"
        )
    updated = await course_svc.update_course(course, payload, user)
    return CourseRead.model_validate(updated)


@router.delete("/{course_id}", status_code=204)
async def delete_course(
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "admin"}:
        raise ProblemException(
            status_code=403, detail="Only primary owner / admin can delete", code="FORBIDDEN"
        )
    await course_svc.delete_course(course, user)
    return Response(status_code=204)


@router.post("/{course_id}:archive", response_model=CourseRead)
async def archive_course(
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> CourseRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    res = await course_svc.archive_course(course, user)
    return CourseRead.model_validate(res)


@router.post("/{course_id}:unarchive", response_model=CourseRead)
async def unarchive_course(
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> CourseRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    res = await course_svc.unarchive_course(course, user)
    return CourseRead.model_validate(res)


@router.post(
    "/{course_id}:duplicate",
    response_model=CourseRead,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_course(
    payload: CourseDuplicate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    a_svc: AssignmentSvcDep,
    response: Response,
    session: SessionDep,
) -> CourseRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    clone = await course_svc.duplicate_course(course, payload, user, a_svc=a_svc)
    response.headers["Location"] = f"/api/v1/courses/{clone.id}"
    return CourseRead.model_validate(clone)


@router.get("/{course_id}/dashboard", response_model=DashboardSummary)
async def course_dashboard(
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> DashboardSummary:
    await assert_course_membership(course.id, user, session)
    data = await course_svc.course_dashboard(course)
    return DashboardSummary.model_validate(data)


# ---- B. Course owners -----------------------------------------------------


@router.get("/{course_id}/owners", response_model=list[OwnerRead])
async def list_owners(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
) -> list[OwnerRead]:
    await assert_course_membership(course.id, user, session)
    repo = MemberRepository(session)
    owners = await repo.list_owners(course.id)
    return [OwnerRead.model_validate(o) for o in owners]


@router.post("/{course_id}/owners", response_model=OwnerRead, status_code=201)
async def add_owner(
    payload: OwnerCreate,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> OwnerRead:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "admin"}:
        raise ProblemException(
            status_code=403, detail="Only primary owner can assign co-owner", code="FORBIDDEN"
        )
    owner = await course_svc.add_owner(course, payload.user_id, user)
    return OwnerRead.model_validate(owner)


@router.delete("/{course_id}/owners/{user_id}", status_code=204)
async def remove_owner(
    user_id: str,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(course.id, user, session)
    # Spec: only ``owner`` may remove a co_owner; we additionally allow a
    # co_owner to step down themselves (self-leave).
    is_self_leave = user_id == user.user_id and role == "co_owner"
    if role not in {"owner", "admin"} and not is_self_leave:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    repo = MemberRepository(session)
    target = await repo.get_owner(course.id, user_id)
    if target is None:
        raise ProblemException(status_code=404, detail="Owner not found", code="NOT_FOUND")
    await course_svc.remove_owner(course, target, user)
    return Response(status_code=204)


@router.post("/{course_id}/owners/{user_id}:promote", response_model=CourseRead)
async def promote_owner(
    user_id: str,
    course: CourseDep,
    user: UserDep,
    course_svc: CourseSvcDep,
    session: SessionDep,
) -> CourseRead:
    role = await assert_course_membership(course.id, user, session)
    if role not in {"owner", "admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    res = await course_svc.promote_owner(course, user_id, user)
    return CourseRead.model_validate(res)
