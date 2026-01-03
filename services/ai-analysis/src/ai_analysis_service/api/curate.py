"""Curate-as-feedback + share/unshare endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from ..common.events import build_event
from ..common.problem import upstream_failed, validation
from ..deps import (
    PrincipalDep,
    PublisherDep,
    SessionDep,
    SubmissionClientDep,
)
from ..schemas import (
    AnalysisOut,
    CurateAsFeedbackRequest,
    CurateAsFeedbackResponse,
)
from ..services.submission_client import SubmissionClientError
from ._helpers import auth_for_analysis, fetch_analysis, to_analysis_out

router = APIRouter(prefix="/api/v1")


@router.post(
    "/ai-analyses/{analysis_id}:curate-as-feedback",
    response_model=CurateAsFeedbackResponse,
)
async def curate_as_feedback(
    analysis_id: str,
    body: CurateAsFeedbackRequest,
    principal: PrincipalDep,
    session: SessionDep,
    submission_client: SubmissionClientDep,
    publisher: PublisherDep,
) -> CurateAsFeedbackResponse:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    if row.report is None:
        raise validation("analysis report not available")

    # Build the structured payload sent to the Submission Service
    raw = dict(row.report)
    summary = body.edited_summary or raw.get("summary", "")
    risks = [
        s
        for s in raw.get("risk_signals", [])
        if not body.include_risk_signals or s.get("type") in body.include_risk_signals
    ]
    qs_all = list(raw.get("questions", []))
    questions = (
        [qs_all[i] for i in body.include_questions if 0 <= i < len(qs_all)]
        if body.include_questions
        else qs_all
    )
    payload = {
        "source_analysis_id": row.id,
        "summary": summary,
        "risk_signals": risks,
        "questions": questions,
        "additional_text": body.additional_text,
        "visible_to_student": bool(body.visible_to_student),
    }

    try:
        resp = await submission_client.create_feedback_from_llm(
            row.submission_id,
            tenant_id=principal.tenant_id,
            actor_id=principal.user_id,
            body=payload,
        )
    except SubmissionClientError as exc:
        raise upstream_failed(str(exc))

    feedback_id = str(resp.get("id") or resp.get("feedback_id") or "")
    if not feedback_id:
        raise upstream_failed("submission service did not return feedback id")

    row.curated_feedback_id = feedback_id
    row.shared_with_student = bool(body.visible_to_student) or row.shared_with_student
    await session.commit()

    await publisher.publish(
        build_event(
            "ai.analysis.curated.v1",
            tenant_id=row.tenant_id,
            subject=f"ai-analyses/{row.id}",
            data={
                "analysis_id": row.id,
                "submission_id": row.submission_id,
                "feedback_id": feedback_id,
                "visible_to_student": bool(body.visible_to_student),
            },
        )
    )
    return CurateAsFeedbackResponse(
        analysis_id=row.id,
        feedback_id=feedback_id,
        visible_to_student=bool(body.visible_to_student),
    )


@router.post(
    "/ai-analyses/{analysis_id}:share-with-student",
    response_model=AnalysisOut,
)
async def share_with_student(
    analysis_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    publisher: PublisherDep,
) -> AnalysisOut:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    row.shared_with_student = True
    await session.commit()
    await publisher.publish(
        build_event(
            "ai.analysis.shared.v1",
            tenant_id=row.tenant_id,
            subject=f"ai-analyses/{row.id}",
            data={"analysis_id": row.id, "shared": True},
        )
    )
    return to_analysis_out(row)


@router.post(
    "/ai-analyses/{analysis_id}:unshare",
    response_model=AnalysisOut,
)
async def unshare(
    analysis_id: str,
    principal: PrincipalDep,
    session: SessionDep,
    publisher: PublisherDep,
) -> AnalysisOut:
    row = await fetch_analysis(session, analysis_id, principal.tenant_id)
    auth_for_analysis(principal, row)
    row.shared_with_student = False
    await session.commit()
    await publisher.publish(
        build_event(
            "ai.analysis.shared.v1",
            tenant_id=row.tenant_id,
            subject=f"ai-analyses/{row.id}",
            data={"analysis_id": row.id, "shared": False},
        )
    )
    return to_analysis_out(row)
