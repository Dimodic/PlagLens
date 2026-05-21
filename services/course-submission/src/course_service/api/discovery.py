"""Section J — Course discovery (``/users/me/...``)."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query

from ..common.pagination import Page, build_page
from ..repositories.assignments import AssignmentRepository
from ..repositories.courses import CourseRepository
from ..schemas.assignment import AssignmentRead
from ..schemas.course import CourseRead
from ._helpers import SessionDep, UserDep, parse_cursor_id, parse_limit

router = APIRouter(prefix="/api/v1/users/me", tags=["discovery"])


@router.get("/courses", response_model=Page[CourseRead])
async def my_courses(
    user: UserDep,
    session: SessionDep,
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[CourseRead]:
    repo = CourseRepository(session)
    rows, next_id = await repo.list_courses_for_user(
        user.user_id, user.tenant_id, cursor_id=cursor_id, limit=limit
    )
    return build_page(
        [CourseRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@router.get(
    "/courses/{course_id}/assignments", response_model=Page[AssignmentRead]
)
async def my_course_assignments(
    course_id: int,
    user: UserDep,
    session: SessionDep,
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[AssignmentRead]:
    # Visible only if the user is a member; also restrict to published.
    crepo = CourseRepository(session)
    rows_courses, _ = await crepo.list_courses_for_user(
        user.user_id, user.tenant_id, cursor_id=None, limit=200
    )
    if not any(c.id == course_id for c in rows_courses):
        return build_page([], limit=limit, next_id=None)
    arepo = AssignmentRepository(session)
    rows, next_id = await arepo.list_for_user(
        [course_id], published_only=True, cursor_id=cursor_id, limit=limit
    )
    return build_page(
        [AssignmentRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@router.get("/assignments", response_model=Page[AssignmentRead])
async def my_assignments(
    user: UserDep,
    session: SessionDep,
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[AssignmentRead]:
    crepo = CourseRepository(session)
    rows_courses, _ = await crepo.list_courses_for_user(
        user.user_id, user.tenant_id, cursor_id=None, limit=500
    )
    course_ids = [c.id for c in rows_courses]
    arepo = AssignmentRepository(session)
    rows, next_id = await arepo.list_for_user(
        course_ids, published_only=True, cursor_id=cursor_id, limit=limit
    )
    return build_page(
        [AssignmentRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@router.get("/assignments/upcoming", response_model=list[AssignmentRead])
async def my_upcoming_assignments(
    user: UserDep,
    session: SessionDep,
    limit: int = Query(default=50, ge=1, le=200),
) -> list[AssignmentRead]:
    crepo = CourseRepository(session)
    rows_courses, _ = await crepo.list_courses_for_user(
        user.user_id, user.tenant_id, cursor_id=None, limit=500
    )
    course_ids = [c.id for c in rows_courses]
    arepo = AssignmentRepository(session)
    rows = await arepo.list_upcoming(
        course_ids, now=datetime.now(tz=UTC), limit=limit
    )
    return [AssignmentRead.model_validate(r) for r in rows]
