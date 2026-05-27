"""Student self-service endpoints (section F of 06-SUBMISSION.md)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query

from submission_service.api.deps import CourseDep, CurrentUser, SessionDep
from submission_service.common.pagination import Page, PageInfo
from submission_service.common.problem import forbidden, not_found
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.schemas.feedback import FeedbackOut
from submission_service.schemas.grading import GradeOut
from submission_service.schemas.submission import SubmissionOut

router = APIRouter()


def _ensure_self(sub: Any, user_id: str) -> None:
    if sub.author_id != user_id:
        raise forbidden("Not your submission")


@router.get(
    "/users/me/assignments/{assignment_id}/submissions",
    response_model=list[SubmissionOut],
)
async def my_submissions_for_assignment(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    items = await repo.list_for_user(
        author_id=user.user_id,
        tenant_id=user.tenant_id,
        assignment_id=assignment_id,
    )
    return [SubmissionOut.model_validate(s) for s in items]


_STAFF_ROLES = {
    "teacher", "owner", "co_owner", "assistant",
    "admin",
}


@router.get("/users/me/submissions", response_model=Page[SubmissionOut])
async def my_submissions(
    user: CurrentUser,
    session: SessionDep,
    course_id: str | None = None,
    assignment_id: str | None = None,
    assignment_ids: list[str] | None = Query(default=None),
    language: str | None = None,
    assigned_grader_id: str | None = None,
    latest_per_student: bool = Query(default=False),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
) -> Page[SubmissionOut]:
    """Dual-mode list:
      - **student** → own submissions (filter by author_id).
      - **teacher / admin / assistant** → inbox view: every submission in the
        tenant (filtered optionally by course/assignment/language). Teachers
        don't have "own" submissions — this surface is the triage queue.

    ``latest_per_student`` (staff only) collapses multiple versions per
    (assignment, author) into one row — the teacher's queue then counts
    "distinct submissions to review", not "raw v1/v2/v3 history rows".

    Page envelope: the repo over-fetches a single window and we slice it
    server-side. ``total`` is the full count after filters, which is what
    the UI needs to render numbered page buttons. For staff inboxes the
    upper window is capped at 10 000 to bound the COUNT(*) — anything
    bigger would need real DB-level offset pagination."""
    repo = SubmissionRepository(session)
    if user.global_role in _STAFF_ROLES:
        all_items = await repo.list_inbox_for_staff(
            tenant_id=user.tenant_id,
            course_id=course_id,
            assignment_id=assignment_id,
            assignment_ids=assignment_ids,
            language=language,
            assigned_grader_id=assigned_grader_id,
            latest_per_student=latest_per_student,
            limit=10_000,
        )
    else:
        all_items = await repo.list_for_user(
            author_id=user.user_id,
            tenant_id=user.tenant_id,
            course_id=course_id,
            assignment_id=assignment_id,
            language=language,
            limit=10_000,
        )
    total = len(all_items)
    window = all_items[offset : offset + limit]
    info = PageInfo(
        next_cursor=None,
        has_more=offset + limit < total,
        limit=limit,
        offset=offset,
        total=total,
    )
    return Page[SubmissionOut](
        data=[SubmissionOut.model_validate(s) for s in window],
        pagination=info,
    )


@router.get("/users/me/submissions/{submission_id}", response_model=SubmissionOut)
async def my_submission(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> SubmissionOut:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    _ensure_self(sub, user.user_id)
    return SubmissionOut.model_validate(sub)


@router.get(
    "/users/me/submissions/{submission_id}/grade", response_model=GradeOut
)
async def my_grade(
    submission_id: str,
    user: CurrentUser,
    session: SessionDep,
    course: CourseDep,
) -> GradeOut:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    _ensure_self(sub, user.user_id)
    grade = await repo.get_grade(sub.id)
    if grade is None:
        raise not_found("Grade not set")
    if not grade.comment_visible_to_student:
        raise forbidden("Grade not yet visible")
    assignment = await course.get_assignment(sub.assignment_id)
    if assignment and assignment.visible_to_students_at:
        from datetime import UTC

        vis = assignment.visible_to_students_at
        if vis.tzinfo is None:
            vis = vis.replace(tzinfo=UTC)
        if datetime.now(UTC) < vis:
            raise forbidden("Grade not yet visible per assignment schedule")
    return GradeOut.model_validate(grade)


@router.get(
    "/users/me/submissions/{submission_id}/feedback",
    response_model=list[FeedbackOut],
)
async def my_feedback(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> list[FeedbackOut]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    _ensure_self(sub, user.user_id)
    items = await repo.list_feedback(sub.id, visible_only=True)
    return [FeedbackOut.model_validate(f) for f in items]


@router.get("/users/me/submissions/{submission_id}/plagiarism")
async def my_plagiarism(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> dict[str, Any]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    _ensure_self(sub, user.user_id)
    flags = sub.flags or {}
    return {
        "submission_id": sub.id,
        "suspicious": bool(flags.get("suspicious", False)),
        "similarity_percent": flags.get("similarity_percent"),
    }


@router.get("/users/me/submissions/{submission_id}/ai")
async def my_ai(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> dict[str, Any]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    _ensure_self(sub, user.user_id)
    items = await repo.list_feedback(sub.id, visible_only=True)
    llm = [f for f in items if f.source == "llm_curated"]
    return {
        "submission_id": sub.id,
        "comments": [
            {"id": f.id, "body": f.body, "created_at": f.created_at} for f in llm
        ],
    }
