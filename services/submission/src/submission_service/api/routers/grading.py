"""Grading endpoints (section C of 06-SUBMISSION.md)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Response

from submission_service.api.deps import (
    CourseDep,
    CurrentUser,
    PublisherDep,
    SessionDep,
    SubmissionServiceDep,
)
from submission_service.common.events import build_event
from submission_service.common.problem import forbidden, not_found
from submission_service.common.rbac import (
    ensure_can_modify_submission,
    ensure_can_view_submission,
    ensure_course_staff,
)
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.schemas.grading import (
    GradeHistoryEntry,
    GradeIn,
    GradeOut,
    GradePatch,
)

router = APIRouter()


@router.get("/submissions/{submission_id}/grade", response_model=GradeOut)
async def get_grade(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> GradeOut:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    grade = await repo.get_grade(sub.id)
    if grade is None:
        raise not_found("Grade not set")
    if (
        sub.author_id == user.user_id
        and not user.can_manage_course(sub.course_id)
        and not grade.comment_visible_to_student
    ):
        raise forbidden("Grade not yet visible to student")
    return GradeOut.model_validate(grade)


@router.post("/submissions/{submission_id}/grade", response_model=GradeOut)
async def set_grade(
    submission_id: str,
    payload: GradeIn,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
    course: CourseDep,
) -> GradeOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    assignment = await course.get_assignment(sub.assignment_id)
    grade = await service.set_grade(
        sub=sub,
        score=payload.score,
        max_score=payload.max_score,
        comment_visible_to_student=payload.comment_visible_to_student,
        graded_by=user.user_id,
        assignment=assignment,
        comment=payload.comment,
    )
    await publisher.publish(
        build_event(
            type_="plaglens.submission.grade.assigned.v1",
            tenant_id=sub.tenant_id,
            subject=f"submissions/{sub.id}",
            data={
                "submission_id": sub.id,
                "score": float(grade.score) if grade.score is not None else None,
                "applied_multiplier": float(grade.applied_multiplier),
                "graded_by": user.user_id,
            },
            actor={"type": "user", "id": user.user_id, "role": user.global_role},
        )
    )
    return GradeOut.model_validate(grade)


@router.patch("/submissions/{submission_id}/grade", response_model=GradeOut)
async def patch_grade(
    submission_id: str,
    payload: GradePatch,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
    course: CourseDep,
) -> GradeOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    assignment = await course.get_assignment(sub.assignment_id)
    # PATCH must distinguish "no comment in payload" from "comment cleared"
    # — we use ``model_fields_set`` (the actual set of fields sent by the
    # client) rather than just ``payload.comment is None``, since None is
    # a valid "wipe the comment" sentinel.
    comment_in_payload = "comment" in payload.model_fields_set
    grade = await service.patch_grade(
        sub=sub,
        score=payload.score,
        max_score=payload.max_score,
        comment_visible_to_student=payload.comment_visible_to_student,
        graded_by=user.user_id,
        assignment=assignment,
        comment=payload.comment,
        comment_provided=comment_in_payload,
    )
    await publisher.publish(
        build_event(
            type_="plaglens.submission.grade.changed.v1",
            tenant_id=sub.tenant_id,
            subject=f"submissions/{sub.id}",
            data={
                "submission_id": sub.id,
                "score": float(grade.score) if grade.score is not None else None,
                "applied_multiplier": float(grade.applied_multiplier),
                "graded_by": user.user_id,
            },
            actor={"type": "user", "id": user.user_id, "role": user.global_role},
        )
    )
    return GradeOut.model_validate(grade)


@router.delete(
    "/submissions/{submission_id}/grade",
    status_code=204,
    response_class=Response,
)
async def delete_grade(
    submission_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
) -> Response:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    # Symmetric with POST/PATCH: anyone who can set a grade can also
    # remove one. Previously this required full owner role, which made
    # graders helpless after a misclick on a wrong row.
    ensure_can_modify_submission(user, sub)
    await service.remove_grade(sub, actor_user_id=user.user_id)
    await publisher.publish(
        build_event(
            type_="plaglens.submission.grade.removed.v1",
            tenant_id=sub.tenant_id,
            subject=f"submissions/{sub.id}",
            data={"submission_id": sub.id},
            actor={"type": "user", "id": user.user_id, "role": user.global_role},
        )
    )
    return Response(status_code=204)


@router.get(
    "/submissions/{submission_id}/grade/history",
    response_model=list[GradeHistoryEntry],
)
async def grade_history(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> list[GradeHistoryEntry]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    rows = await repo.list_grade_history(sub.id)
    return [GradeHistoryEntry.model_validate(r) for r in rows]


@router.get("/assignments/{assignment_id}/aggregate-stats")
async def assignment_aggregate_stats(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> dict[str, Any]:
    """Submission-side stats aggregate for an assignment. Used by the
    course service ``/assignments/{id}/stats`` proxy and (optionally)
    by the frontend directly. RBAC: course staff."""
    repo = SubmissionRepository(session)
    # Authorize via the assignment's course_id, which we can pull from
    # any submission row (all share the same course). ``ensure_course_staff``
    # — not a raw ``can_manage_course`` — so a teacher whose JWT has empty
    # ``course_roles`` (identity-service doesn't enrich them yet) still
    # passes via the global-role fallback, same as latest-per-student.
    latest = await repo.list_latest_per_student(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )
    if latest:
        ensure_course_staff(user, latest[0].course_id)
    return await repo.assignment_aggregate_stats(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )


@router.get(
    "/assignments/{assignment_id}/grades",
    response_model=list[GradeOut],
)
async def list_assignment_grades(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[GradeOut]:
    """All grades for one assignment, used by the stats page to draw
    the score histogram. Course staff only; we authorize by checking
    the first submission's course_id (all submissions of an assignment
    share the same course).
    """
    repo = SubmissionRepository(session)
    rows = await repo.list_grades_for_assignment(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )
    if rows:
        _, first_sub = rows[0]
        # ``ensure_course_staff`` (with its global-role fallback), not a
        # raw ``can_manage_course`` — otherwise a teacher with empty
        # course_roles in the JWT gets a spurious 403, the exact bug that
        # left the submissions-list grade chip empty.
        ensure_course_staff(user, first_sub.course_id)
    # Surface the author on each row so callers (the reporting service's
    # grade-export builder, the stats page) can attribute a grade to a
    # student without re-fetching the submission.
    return [
        GradeOut.model_validate(g).model_copy(
            update={"author_id": s.author_id, "author_label": s.author_label}
        )
        for (g, s) in rows
    ]
