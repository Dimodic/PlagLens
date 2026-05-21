"""Sections F (assignments), G (deadlines), H (grading), I (stats)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Response

from ..common.pagination import Page, build_page
from ..common.problem import ProblemException
from ..deps import assert_course_membership, is_course_manager
from ..repositories.assignments import AssignmentRepository
from ..schemas.assignment import (
    AssignmentCreate,
    AssignmentDeadlines,
    AssignmentDeadlinesUpdate,
    AssignmentDuplicate,
    AssignmentRead,
    AssignmentUpdate,
    DeadlineExtensionCreate,
    DeadlineExtensionRead,
    EffectiveDeadline,
    GradingConfigRead,
    GradingConfigUpdate,
    StatsTimelinePoint,
)
from ._helpers import (
    AssignmentDep,
    AssignmentSvcDep,
    CourseDep,
    SessionDep,
    UserDep,
    get_bearer_token,
    parse_cursor_id,
    parse_limit,
)

course_assignments_router = APIRouter(prefix="/api/v1/courses", tags=["assignments"])
flat_router = APIRouter(prefix="/api/v1/assignments", tags=["assignments"])


# ---- F. Assignments -------------------------------------------------------


@course_assignments_router.get(
    "/{course_id}/assignments", response_model=Page[AssignmentRead]
)
async def list_course_assignments(
    course: CourseDep,
    user: UserDep,
    session: SessionDep,
    status_filter: str | None = Query(default=None, alias="status"),
    homework_id: int | None = Query(default=None),
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Depends(parse_limit),
) -> Page[AssignmentRead]:
    role = await assert_course_membership(course.id, user, session)
    repo = AssignmentRepository(session)
    if role == "student":
        # Students see non-archived assignments only. Archive-only
        # lifecycle: there is no longer a separate "published" gate, so
        # an unarchived assignment is automatically visible.
        rows, next_id = await repo.list_for_course(
            course.id,
            status="active",
            homework_id=homework_id,
            cursor_id=cursor_id,
            limit=limit,
        )
    else:
        rows, next_id = await repo.list_for_course(
            course.id,
            status=status_filter,
            homework_id=homework_id,
            cursor_id=cursor_id,
            limit=limit,
        )
    return build_page(
        [AssignmentRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@course_assignments_router.post(
    "/{course_id}/assignments", response_model=AssignmentRead, status_code=201
)
async def create_assignment(
    payload: AssignmentCreate,
    course: CourseDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
    response: Response,
    bearer: str | None = Depends(get_bearer_token),
) -> AssignmentRead:
    role = await assert_course_membership(course.id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    a = await a_svc.create(course, payload, user, bearer_token=bearer)
    response.headers["Location"] = f"/api/v1/assignments/{a.id}"
    return AssignmentRead.model_validate(a)


@flat_router.get("", response_model=Page[AssignmentRead])
async def list_assignments_flat(
    user: UserDep,
    session: SessionDep,
    q: str | None = Query(default=None, max_length=120),
    cursor_id: int | None = Depends(parse_cursor_id),
    limit: int = Query(default=20, ge=1, le=50),
) -> Page[AssignmentRead]:
    """Cross-course assignment search (used for global ⌘K search).

    Tenant-scoped via Course join. Non-admin actors are restricted to assignments
    in courses where they are owner / co_owner / assistant / student. Students
    additionally only see ``published`` assignments.
    """
    repo = AssignmentRepository(session)
    course_ids: list[int] | None = None
    published_only = False
    if user.global_role not in {"admin"}:
        # Build the set of course_ids visible to the actor (member or owner).
        from sqlalchemy import select  # local import to avoid top-level churn

        from ..models import CourseMember, CourseOwner

        member_stmt = select(CourseMember.course_id).where(
            CourseMember.user_id == user.user_id,
            CourseMember.removed_at.is_(None),
        )
        owner_stmt = select(CourseOwner.course_id).where(
            CourseOwner.user_id == user.user_id,
        )
        member_rows = (await session.execute(member_stmt)).scalars().all()
        owner_rows = (await session.execute(owner_stmt)).scalars().all()
        course_ids = list({*member_rows, *owner_rows})
        # Students see only published; if user is owner/co_owner/assistant in
        # at least one course we keep all statuses (they are course manager
        # somewhere). Coarse heuristic — fine for global search.
        if user.global_role == "student":
            published_only = True
    rows, next_id = await repo.list_with_filter(
        tenant_id=user.tenant_id,
        q=q,
        course_ids=course_ids,
        published_only=published_only,
        cursor_id=cursor_id,
        limit=limit,
    )
    return build_page(
        [AssignmentRead.model_validate(r) for r in rows], limit=limit, next_id=next_id
    )


@flat_router.get("/{assignment_id}", response_model=AssignmentRead)
async def get_assignment(
    assignment: AssignmentDep,
    user: UserDep,
    session: SessionDep,
) -> AssignmentRead:
    role = await assert_course_membership(assignment.course_id, user, session)
    if role == "student" and assignment.status == "archived":
        raise ProblemException(status_code=404, detail="Not found", code="NOT_FOUND")
    return AssignmentRead.model_validate(assignment)


@flat_router.patch("/{assignment_id}", response_model=AssignmentRead)
async def update_assignment(
    payload: AssignmentUpdate,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> AssignmentRead:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    res = await a_svc.update(assignment, payload, user)
    return AssignmentRead.model_validate(res)


@flat_router.delete("/{assignment_id}", status_code=204)
async def delete_assignment(
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    await a_svc.delete(assignment, user)
    return Response(status_code=204)


# Note: the legacy ``:publish`` endpoint has been removed — archive-only
# lifecycle, so assignments are visible to students as soon as they are
# created and the only deliberate action left is ``:archive``.


@flat_router.post("/{assignment_id}:archive", response_model=AssignmentRead)
async def archive_assignment(
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> AssignmentRead:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    res = await a_svc.transition(assignment, target="archived", user=user)
    return AssignmentRead.model_validate(res)


@flat_router.post(
    "/{assignment_id}:duplicate",
    response_model=AssignmentRead,
    status_code=201,
)
async def duplicate_assignment(
    payload: AssignmentDuplicate,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
    response: Response,
) -> AssignmentRead:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    if payload.target_course_id is not None and payload.target_course_id != assignment.course_id:
        target_role = await assert_course_membership(payload.target_course_id, user, session)
        if not is_course_manager(target_role):
            raise ProblemException(
                status_code=403, detail="No access to target course", code="FORBIDDEN"
            )
    clone = await a_svc.duplicate(assignment, payload, user)
    response.headers["Location"] = f"/api/v1/assignments/{clone.id}"
    return AssignmentRead.model_validate(clone)


# ---- G. Deadlines ---------------------------------------------------------


@flat_router.get("/{assignment_id}/deadlines", response_model=AssignmentDeadlines)
async def get_deadlines(
    assignment: AssignmentDep,
    user: UserDep,
    session: SessionDep,
) -> AssignmentDeadlines:
    await assert_course_membership(assignment.course_id, user, session)
    return AssignmentDeadlines(
        deadline_soft_at=assignment.deadline_soft_at,
        deadline_hard_at=assignment.deadline_hard_at,
        late_score_multiplier=assignment.late_score_multiplier,
    )


@flat_router.patch("/{assignment_id}/deadlines", response_model=AssignmentDeadlines)
async def update_deadlines(
    payload: AssignmentDeadlinesUpdate,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> AssignmentDeadlines:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    res = await a_svc.update_deadlines(assignment, payload, user)
    return AssignmentDeadlines(
        deadline_soft_at=res.deadline_soft_at,
        deadline_hard_at=res.deadline_hard_at,
        late_score_multiplier=res.late_score_multiplier,
    )


@flat_router.get(
    "/{assignment_id}/deadlines/effective-for/{user_id}",
    response_model=EffectiveDeadline,
)
async def effective_deadline(
    user_id: str,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> EffectiveDeadline:
    role = await assert_course_membership(assignment.course_id, user, session)
    if user_id != user.user_id and role not in {
        "owner",
        "co_owner",
        "assistant",
        "admin",
    }:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    return await a_svc.effective_deadline(assignment, user_id)


@flat_router.post(
    "/{assignment_id}/deadline-extensions",
    response_model=DeadlineExtensionRead,
    status_code=201,
)
async def create_deadline_extension(
    payload: DeadlineExtensionCreate,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> DeadlineExtensionRead:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    ext = await a_svc.create_extension(assignment, payload, user)
    return DeadlineExtensionRead.model_validate(ext)


@flat_router.get(
    "/{assignment_id}/deadline-extensions",
    response_model=list[DeadlineExtensionRead],
)
async def list_deadline_extensions(
    assignment: AssignmentDep,
    user: UserDep,
    session: SessionDep,
) -> list[DeadlineExtensionRead]:
    role = await assert_course_membership(assignment.course_id, user, session)
    if role not in {"owner", "co_owner", "assistant", "admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    repo = AssignmentRepository(session)
    rows = await repo.list_extensions(assignment.id)
    return [DeadlineExtensionRead.model_validate(r) for r in rows]


@flat_router.delete(
    "/{assignment_id}/deadline-extensions/{ext_id}", status_code=204
)
async def delete_deadline_extension(
    ext_id: int,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> Response:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    repo = AssignmentRepository(session)
    ext = await repo.get_extension(assignment.id, ext_id)
    if ext is None:
        raise ProblemException(status_code=404, detail="Not found", code="NOT_FOUND")
    await repo.delete_extension(ext)
    return Response(status_code=204)


# ---- H. Grading config ----------------------------------------------------


@flat_router.get(
    "/{assignment_id}/grading-config", response_model=GradingConfigRead
)
async def get_grading_config(
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> GradingConfigRead:
    await assert_course_membership(assignment.course_id, user, session)
    cfg = await a_svc.repo.get_grading_config(assignment.id)
    if cfg is None:
        cfg = await a_svc.repo.upsert_grading_config(assignment.id)
    return GradingConfigRead.model_validate(cfg)


@flat_router.patch(
    "/{assignment_id}/grading-config", response_model=GradingConfigRead
)
async def update_grading_config(
    payload: GradingConfigUpdate,
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> GradingConfigRead:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    cfg = await a_svc.update_grading(assignment, payload)
    return GradingConfigRead.model_validate(cfg)


@flat_router.get(
    "/{assignment_id}/grading-config/rubric", response_model=dict[str, Any]
)
async def get_rubric(
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> dict[str, Any]:
    await assert_course_membership(assignment.course_id, user, session)
    cfg = await a_svc.repo.get_grading_config(assignment.id)
    return dict(cfg.rubric) if cfg is not None else {}


@flat_router.patch(
    "/{assignment_id}/grading-config/rubric", response_model=dict[str, Any]
)
async def update_rubric(
    payload: dict[str, Any],
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> dict[str, Any]:
    role = await assert_course_membership(assignment.course_id, user, session)
    if not is_course_manager(role):
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    cfg = await a_svc.update_rubric(assignment, payload)
    return dict(cfg.rubric)


# ---- I. Stats -------------------------------------------------------------


@flat_router.get("/{assignment_id}/stats")
async def assignment_stats(
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
    bearer: str | None = Depends(get_bearer_token),
) -> dict[str, Any]:
    """Real assignment stats, fetched by proxying to submission_service
    (which owns the submission + grade tables). Falls back to a
    zero-value stub if the downstream call fails so the UI degrades
    gracefully instead of 500-ing.
    """
    role = await assert_course_membership(assignment.course_id, user, session)
    if role not in {"owner", "co_owner", "assistant", "admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    return await a_svc.stats(assignment, bearer_token=bearer)


@flat_router.get(
    "/{assignment_id}/stats/timeline",
    response_model=list[StatsTimelinePoint],
)
async def assignment_stats_timeline(
    assignment: AssignmentDep,
    user: UserDep,
    a_svc: AssignmentSvcDep,
    session: SessionDep,
) -> list[StatsTimelinePoint]:
    role = await assert_course_membership(assignment.course_id, user, session)
    if role not in {"owner", "co_owner", "assistant", "admin"}:
        raise ProblemException(status_code=403, detail="Forbidden", code="FORBIDDEN")
    rows = await a_svc.stats_timeline(assignment)
    return [StatsTimelinePoint.model_validate(r) for r in rows]
