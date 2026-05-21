"""Homework routes — Course → Homework → Assignment hierarchy.

Two routers:

- ``course_homeworks_router`` — collection endpoints scoped to a course
  (``/api/v1/courses/{course_id}/homeworks``).
- ``flat_router`` — item endpoints by homework id
  (``/api/v1/homeworks/{homework_id}``) plus ``/assignments`` listing.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response

from ..common.pagination import Page, build_page
from ..common.problem import ProblemException
from ..deps import assert_course_membership, is_course_manager
from ..repositories.assignments import AssignmentRepository
from ..repositories.homeworks import HomeworkRepository
from ..schemas.assignment import AssignmentRead
from ..schemas.homework import HomeworkCreate, HomeworkRead, HomeworkUpdate
from ._helpers import (
    CourseDep,
    HomeworkDep,
    HomeworkSvcDep,
    SessionDep,
    UserDep,
    parse_cursor_id,
    parse_limit,
)

course_homeworks_router = APIRouter(prefix="/api/v1/courses", tags=["homeworks"])
flat_router = APIRouter(prefix="/api/v1/homeworks", tags=["homeworks"])


# ---- Course-scoped collection ---------------------------------------------


@course_homeworks_router.get(
    "/{course_id}/homeworks", response_model=Page[HomeworkRead]
)
async def list_course_homeworks(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[HomeworkRead]:
    role = await assert_course_membership(course.id, user, session)
    repo = HomeworkRepository(session)
    # Archive-only lifecycle: students see non-archived homeworks.
    effective_status = status_filter
    if role == "student":
        effective_status = "active"
    rows, next_id = await repo.list_for_course(
        course.id, status=effective_status, cursor_id=cursor_id, limit=limit
    )
    return build_page(
        [HomeworkRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@course_homeworks_router.post(
    "/{course_id}/homeworks", response_model=HomeworkRead, status_code=201
)
async def create_homework(
    payload: HomeworkCreate,
    course: CourseDep,
    user: UserDep,
    hw_svc: HomeworkSvcDep,
    session: SessionDep,
    response: Response,
) -> HomeworkRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    hw = await hw_svc.create(course, payload, user)
    response.headers["Location"] = f"/api/v1/homeworks/{hw.id}"
    return HomeworkRead.model_validate(hw)


# ---- Flat item endpoints --------------------------------------------------


@flat_router.get("/{homework_id}", response_model=HomeworkRead)
async def get_homework(
    homework: HomeworkDep,
    user: UserDep,
    session: SessionDep,
) -> HomeworkRead:
    role = await assert_course_membership(homework.course_id, user, session)
    if role == "student" and homework.status == "archived":
        raise ProblemException(status_code=404, detail="Not found", code="NOT_FOUND")
    return HomeworkRead.model_validate(homework)


@flat_router.patch("/{homework_id}", response_model=HomeworkRead)
async def update_homework(
    payload: HomeworkUpdate,
    homework: HomeworkDep,
    user: UserDep,
    hw_svc: HomeworkSvcDep,
    session: SessionDep,
) -> HomeworkRead:
    role = await assert_course_membership(homework.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    crepo_session = session
    from ..repositories.courses import CourseRepository

    course = await CourseRepository(crepo_session).get(homework.course_id)
    assert course is not None
    res = await hw_svc.update(homework, course, payload, user)
    return HomeworkRead.model_validate(res)


@flat_router.delete("/{homework_id}", status_code=204)
async def delete_homework(
    homework: HomeworkDep,
    user: UserDep,
    hw_svc: HomeworkSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(homework.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    from ..repositories.courses import CourseRepository

    course = await CourseRepository(session).get(homework.course_id)
    assert course is not None
    await hw_svc.delete(homework, course, user)
    return Response(status_code=204)


@flat_router.get(
    "/{homework_id}/assignments", response_model=Page[AssignmentRead]
)
async def list_homework_assignments(
    homework: HomeworkDep,
    user: UserDep,
    session: SessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[AssignmentRead]:
    role = await assert_course_membership(homework.course_id, user, session)
    repo = AssignmentRepository(session)
    effective_status = status_filter
    if role == "student":
        effective_status = "active"
    rows, next_id = await repo.list_for_homework(
        homework.id, status=effective_status, cursor_id=cursor_id, limit=limit
    )
    return build_page(
        [AssignmentRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )
