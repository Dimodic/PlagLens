"""Feedback endpoints (section D of 06-SUBMISSION.md)."""
from __future__ import annotations

from fastapi import APIRouter, Response

from submission_service.api.deps import (
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
    feedback_visible_to,
)
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.schemas.feedback import (
    FeedbackFromLLMIn,
    FeedbackIn,
    FeedbackOut,
    FeedbackPatch,
)

router = APIRouter()


@router.get(
    "/submissions/{submission_id}/feedback", response_model=list[FeedbackOut]
)
async def list_feedback(
    submission_id: str,
    user: CurrentUser,
    session: SessionDep,
    visible_to_student: bool | None = None,
) -> list[FeedbackOut]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)

    items = await repo.list_feedback(sub.id)
    if not user.can_manage_course(sub.course_id):
        items = [f for f in items if feedback_visible_to(user, f.visible_to_student, sub)]
    if visible_to_student is not None:
        items = [f for f in items if f.visible_to_student == visible_to_student]
    return [FeedbackOut.model_validate(f) for f in items]


@router.post(
    "/submissions/{submission_id}/feedback",
    response_model=FeedbackOut,
    status_code=201,
)
async def create_feedback(
    submission_id: str,
    payload: FeedbackIn,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
) -> FeedbackOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    fb = await service.add_feedback(
        sub=sub,
        author_id=user.user_id,
        body=payload.body,
        visible_to_student=payload.visible_to_student,
    )
    await publisher.publish(
        build_event(
            type_="plaglens.submission.feedback.added.v1",
            tenant_id=sub.tenant_id,
            subject=f"submissions/{sub.id}",
            data={
                "submission_id": sub.id,
                "feedback_id": fb.id,
                "visible_to_student": fb.visible_to_student,
            },
            actor={"type": "user", "id": user.user_id, "role": user.global_role},
        )
    )
    return FeedbackOut.model_validate(fb)


@router.get(
    "/submissions/{submission_id}/feedback/{fb_id}", response_model=FeedbackOut
)
async def get_feedback(
    submission_id: str, fb_id: str, user: CurrentUser, session: SessionDep
) -> FeedbackOut:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    fb = await repo.get_feedback(fb_id)
    if fb is None or fb.submission_id != submission_id or fb.deleted_at is not None:
        raise not_found("Feedback not found")
    if not user.can_manage_course(sub.course_id):
        if not feedback_visible_to(user, fb.visible_to_student, sub):
            raise forbidden("Feedback not visible to you")
    return FeedbackOut.model_validate(fb)


@router.patch(
    "/submissions/{submission_id}/feedback/{fb_id}", response_model=FeedbackOut
)
async def patch_feedback(
    submission_id: str,
    fb_id: str,
    payload: FeedbackPatch,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> FeedbackOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    fb = await service.repo.get_feedback(fb_id)
    if fb is None or fb.submission_id != submission_id:
        raise not_found("Feedback not found")
    if fb.author_id != user.user_id and not user.can_manage_course(sub.course_id):
        raise forbidden("Only author or course owner can edit")
    fb = await service.patch_feedback(
        fb, body=payload.body, visible_to_student=payload.visible_to_student
    )
    return FeedbackOut.model_validate(fb)


@router.delete(
    "/submissions/{submission_id}/feedback/{fb_id}",
    status_code=204,
    response_class=Response,
)
async def delete_feedback(
    submission_id: str,
    fb_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> Response:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    fb = await service.repo.get_feedback(fb_id)
    if fb is None or fb.submission_id != submission_id:
        raise not_found("Feedback not found")
    if fb.author_id != user.user_id and not user.can_manage_course(sub.course_id):
        raise forbidden("Only author or course owner can delete")
    await service.soft_delete_feedback(fb)
    return Response(status_code=204)


@router.post(
    "/submissions/{submission_id}/feedback/{fb_id}:publish",
    response_model=FeedbackOut,
)
async def publish_feedback(
    submission_id: str,
    fb_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> FeedbackOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    fb = await service.repo.get_feedback(fb_id)
    if fb is None or fb.submission_id != submission_id:
        raise not_found("Feedback not found")
    if fb.author_id != user.user_id and not user.can_manage_course(sub.course_id):
        raise forbidden("Only author or course owner can publish")
    fb = await service.publish_feedback(fb, visible=True)
    return FeedbackOut.model_validate(fb)


@router.post(
    "/submissions/{submission_id}/feedback/{fb_id}:unpublish",
    response_model=FeedbackOut,
)
async def unpublish_feedback(
    submission_id: str,
    fb_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> FeedbackOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    fb = await service.repo.get_feedback(fb_id)
    if fb is None or fb.submission_id != submission_id:
        raise not_found("Feedback not found")
    if fb.author_id != user.user_id and not user.can_manage_course(sub.course_id):
        raise forbidden("Only author or course owner can unpublish")
    fb = await service.publish_feedback(fb, visible=False)
    return FeedbackOut.model_validate(fb)


@router.post(
    "/submissions/{submission_id}/feedback:from-llm",
    response_model=FeedbackOut,
    status_code=201,
)
async def feedback_from_llm(
    submission_id: str,
    payload: FeedbackFromLLMIn,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
) -> FeedbackOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    fb = await service.add_feedback(
        sub=sub,
        author_id=user.user_id,
        body=payload.edited_body,
        visible_to_student=payload.visible_to_student,
        source="llm_curated",
    )
    await publisher.publish(
        build_event(
            type_="plaglens.submission.feedback.added.v1",
            tenant_id=sub.tenant_id,
            subject=f"submissions/{sub.id}",
            data={
                "submission_id": sub.id,
                "feedback_id": fb.id,
                "ai_analysis_id": payload.ai_analysis_id,
                "source": "llm_curated",
            },
            actor={"type": "user", "id": user.user_id, "role": user.global_role},
        )
    )
    return FeedbackOut.model_validate(fb)
