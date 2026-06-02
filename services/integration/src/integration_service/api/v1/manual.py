"""Manual upload endpoints (§E)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.manual import (
    ParsedSubmission,
    csv_schema,
    csv_template,
    parse_csv,
    parse_zip,
)
from integration_service.common.auth import Principal, ensure_role
from integration_service.common.kafka_bus import KafkaBus
from integration_service.common.problems import ProblemException
from integration_service.config import get_settings
from integration_service.deps import bus_dep, principal_dep, session_dep

router = APIRouter(prefix="/integrations/manual", tags=["manual"])


def _ensure_teacher_or_assistant(p: Principal, course_id: str | None) -> None:
    if p.is_admin:
        return
    if p.has_global("teacher"):
        return
    if course_id and p.course_role(course_id) in ("owner", "co_owner", "assistant"):
        return
    if p.course_role(course_id) in ("owner", "co_owner", "assistant"):
        return
    ensure_role(p, "teacher", "admin")


def _summarise(parsed: list[ParsedSubmission]) -> dict[str, Any]:
    return {
        "items": len(parsed),
        "with_assignment": sum(1 for x in parsed if x.assignment_slug),
        "students": len({x.student_email for x in parsed}),
    }


@router.post("/upload")
async def upload_zip(
    file: UploadFile = File(...),
    course_id: str | None = Form(default=None),
    homework_id: str | None = Form(default=None),
    assignment_id: str | None = Form(default=None),
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    _ensure_teacher_or_assistant(p, course_id)
    s = get_settings()
    raw = await file.read()
    if len(raw) > s.max_upload_bytes:
        raise ProblemException(413, "PAYLOAD_TOO_LARGE", "Too Large", "ZIP exceeds max size")
    try:
        parsed = parse_zip(raw)
    except Exception as exc:
        raise ProblemException(422, "VALIDATION_FAILED", "Invalid ZIP", str(exc)) from exc
    summary = _summarise(parsed)
    await bus.publish(
        s.kafka_topic_integration_import,
        "integration.import.started.v1",
        {
            "kind": "manual",
            "trigger": "upload-zip",
            "course_id": course_id,
            "homework_id": homework_id,
            "assignment_id": assignment_id,
            "summary": summary,
        },
        tenant_id=p.tenant_id,
        actor={"type": "user", "id": p.user_id},
    )
    _ = session
    return {
        "ok": True,
        "summary": summary,
        "items": [
            {
                "student_email": x.student_email,
                "assignment_slug": x.assignment_slug,
                "files": list(x.files.keys()),
            }
            for x in parsed
        ],
    }


@router.post("/upload-csv")
async def upload_csv(
    file: UploadFile = File(...),
    course_id: str | None = Form(default=None),
    homework_id: str | None = Form(default=None),
    assignment_id: str | None = Form(default=None),
    p: Principal = Depends(principal_dep),
    bus: KafkaBus = Depends(bus_dep),
) -> dict[str, Any]:
    _ensure_teacher_or_assistant(p, course_id)
    s = get_settings()
    raw = await file.read()
    if len(raw) > s.max_upload_bytes:
        raise ProblemException(413, "PAYLOAD_TOO_LARGE", "Too Large", "CSV exceeds max size")
    try:
        parsed = parse_csv(raw)
    except Exception as exc:
        raise ProblemException(422, "VALIDATION_FAILED", "Invalid CSV", str(exc)) from exc
    summary = _summarise(parsed)
    await bus.publish(
        s.kafka_topic_integration_import,
        "integration.import.started.v1",
        {
            "kind": "manual",
            "trigger": "upload-csv",
            "course_id": course_id,
            "homework_id": homework_id,
            "assignment_id": assignment_id,
            "summary": summary,
        },
        tenant_id=p.tenant_id,
        actor={"type": "user", "id": p.user_id},
    )
    return {
        "ok": True,
        "summary": summary,
        "items": [
            {
                "student_email": x.student_email,
                "assignment_slug": x.assignment_slug,
                "language": x.language,
                "source_url": x.source_url,
                "has_inline_code": bool(x.inline_code),
            }
            for x in parsed
        ],
    }


@router.get("/templates", response_class=PlainTextResponse)
async def download_template(
    course_id: str | None = None,
    p: Principal = Depends(principal_dep),
) -> PlainTextResponse:
    _ensure_teacher_or_assistant(p, course_id)
    return PlainTextResponse(
        csv_template(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="plaglens-template.csv"'},
    )


@router.get("/templates/csv-schema.json")
async def download_csv_schema() -> dict[str, Any]:
    return csv_schema()


_ = Response
