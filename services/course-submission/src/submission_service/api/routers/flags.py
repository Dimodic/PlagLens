"""Flag endpoints (section E of 06-SUBMISSION.md)."""
from __future__ import annotations

from fastapi import APIRouter, Response

from submission_service.api.deps import (
    CurrentUser,
    SessionDep,
    SubmissionServiceDep,
)
from submission_service.common.problem import not_found
from submission_service.common.rbac import (
    ensure_can_modify_submission,
    ensure_course_staff,
    ensure_tenant,
)
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.schemas.submission import FlagOut, FlagPayload, SubmissionOut

router = APIRouter()


@router.get("/submissions/{submission_id}/flags", response_model=list[FlagOut])
async def list_flags(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> list[FlagOut]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    rows = await repo.list_flags(sub.id)
    return [FlagOut.model_validate(r) for r in rows]


@router.get(
    "/courses/{course_id}/flagged-submissions",
    response_model=list[SubmissionOut],
)
async def course_flagged(
    course_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    ensure_tenant(user, user.tenant_id)
    ensure_course_staff(user, course_id)
    repo = SubmissionRepository(session)
    items = await repo.list_flagged(course_id=course_id, tenant_id=user.tenant_id)
    return [SubmissionOut.model_validate(s) for s in items]


@router.get(
    "/assignments/{assignment_id}/flagged-submissions",
    response_model=list[SubmissionOut],
)
async def assignment_flagged(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    items = await repo.list_flagged(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )
    if items:
        ensure_course_staff(user, items[0].course_id)
    return [SubmissionOut.model_validate(s) for s in items]


@router.post(
    "/submissions/{submission_id}/flags",
    response_model=FlagOut,
    status_code=201,
)
async def add_flag(
    submission_id: str,
    payload: FlagPayload,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> FlagOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    flag = await service.add_flag(
        sub, kind=payload.kind, reason=payload.reason, set_by=user.user_id
    )
    return FlagOut.model_validate(flag)


@router.delete(
    "/submissions/{submission_id}/flags/{flag_id}",
    status_code=204,
    response_class=Response,
)
async def clear_flag(
    submission_id: str,
    flag_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> Response:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    flag = await service.repo.get_flag(flag_id)
    if flag is None or flag.submission_id != submission_id:
        raise not_found("Flag not found")
    await service.clear_flag_by_id(flag)
    return Response(status_code=204)
