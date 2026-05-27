"""Submissions read & write endpoints (sections A & B of 06-SUBMISSION.md)."""
from __future__ import annotations

import difflib
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import PlainTextResponse

from submission_service.api.deps import (
    CurrentUser,
    PublisherDep,
    SessionDep,
    StorageDep,
    SubmissionServiceDep,
    tenant_slug_from_request,
)
from submission_service.common.events import build_event
from submission_service.common.pagination import (
    Page,
    PageInfo,
    decode_cursor,
    encode_cursor,
)
from submission_service.common.problem import not_found
from submission_service.common.rbac import (
    ensure_can_create_submission,
    ensure_can_delete_submission,
    ensure_can_modify_submission,
    ensure_can_view_submission,
    ensure_course_staff,
    ensure_tenant,
)
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.schemas.submission import (
    ExternalParticipantOut,
    FlagPayload,
    SubmissionDetail,
    SubmissionFileOut,
    SubmissionOut,
)
from submission_service.services.submission_service import UploadFile as SvcUploadFile

router = APIRouter()


# ---------- helpers ----------


async def _publish(publisher: PublisherDep, *, type_: str, sub: Any, actor: dict[str, Any]) -> None:
    ev = build_event(
        type_=f"plaglens.{type_}",
        tenant_id=sub.tenant_id,
        subject=f"submissions/{sub.id}",
        data={
            "submission_id": sub.id,
            "assignment_id": sub.assignment_id,
            "course_id": sub.course_id,
            "author_id": sub.author_id,
            "version": sub.version,
            "language": sub.language,
        },
        actor=actor,
    )
    await publisher.publish(ev)


def _paginate(
    items: list[Any],
    cursor: str | None,
    limit: int,
    offset_param: int | None = None,
) -> tuple[list[Any], PageInfo]:
    """Page a fully-materialised list. Accepts either:
      - ``cursor`` (legacy opaque token), or
      - ``offset_param`` (numeric, lets the UI render numbered page buttons).

    The response always carries both ``offset`` and ``total`` so the
    frontend can render Yandex-style "1 2 3 4 …" pagination without
    another round-trip."""
    if offset_param is not None and offset_param > 0:
        offset = offset_param
    else:
        payload = decode_cursor(cursor) or {}
        offset = int(payload.get("offset", 0))
    total = len(items)
    page = items[offset : offset + limit]
    has_more = offset + limit < total
    next_cur = encode_cursor({"offset": offset + limit}) if has_more else None
    return page, PageInfo(
        next_cursor=next_cur,
        has_more=has_more,
        limit=limit,
        offset=offset,
        total=total,
    )


# ---------- A. read ----------


@router.get(
    "/courses/{course_id}/submissions/external-participants",
    response_model=list[ExternalParticipantOut],
)
async def list_external_participants(
    course_id: str,
    user: CurrentUser,
    session: SessionDep,
) -> list[ExternalParticipantOut]:
    """Unclaimed Yandex.Contest participants in a course (staff only).

    Lists imported participants whose ``author_id`` is still ``yc:<uid>`` (not
    yet linked to a PlagLens user), with a submission count — the roster the
    teacher works from to hand out per-participant claim codes. Path nests
    under ``/courses/{id}/submissions`` so the gateway routes it to this
    service (the bare ``/courses/{id}`` prefix goes to course-service).
    """
    ensure_course_staff(user, course_id)
    repo = SubmissionRepository(session)
    rows = await repo.list_external_participants(
        tenant_id=user.tenant_id, course_id=course_id
    )
    return [ExternalParticipantOut(**r) for r in rows]


@router.get(
    "/assignments/{assignment_id}/submissions",
    response_model=Page[SubmissionOut],
)
async def list_submissions(
    assignment_id: str,
    user: CurrentUser,
    session: SessionDep,
    author_id: str | None = None,
    status_: str | None = Query(default=None, alias="status"),
    version: int | None = None,
    late: bool | None = None,
    suspicious: bool | None = None,
    language: str | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    sort: str | None = "-submitted_at",
    cursor: str | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=2000),
) -> Page[SubmissionOut]:
    repo = SubmissionRepository(session)
    items = await repo.list_by_assignment(
        assignment_id=assignment_id,
        tenant_id=user.tenant_id,
        author_id=author_id,
        status=status_,
        late=late,
        suspicious=suspicious,
        language=language,
        min_score=min_score,
        max_score=max_score,
        sort=sort,
        limit=10_000,  # we paginate in Python after Python-level suspicious filter
        offset=0,
    )
    if items:
        ensure_course_staff(user, items[0].course_id)
    if version is not None:
        items = [s for s in items if s.version == version]
    page, info = _paginate(items, cursor, limit, offset_param=offset)
    return Page[SubmissionOut](
        data=[SubmissionOut.model_validate(s) for s in page], pagination=info
    )


@router.get(
    "/assignments/{assignment_id}/submissions/latest-per-student",
    response_model=list[SubmissionOut],
)
async def latest_per_student(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    items = await repo.list_latest_per_student(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )
    if items:
        ensure_course_staff(user, items[0].course_id)
    return [SubmissionOut.model_validate(s) for s in items]


@router.get(
    "/assignments/{assignment_id}/submissions/best-per-student",
    response_model=list[SubmissionOut],
)
async def best_per_student(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    items = await repo.list_best_per_student(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )
    if items:
        ensure_course_staff(user, items[0].course_id)
    return [SubmissionOut.model_validate(s) for s in items]


@router.get(
    "/assignments/{assignment_id}/submissions/selected-per-student",
    response_model=list[SubmissionOut],
)
async def selected_per_student(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    items = await repo.list_selected_per_student(
        assignment_id=assignment_id, tenant_id=user.tenant_id
    )
    if items:
        ensure_course_staff(user, items[0].course_id)
    return [SubmissionOut.model_validate(s) for s in items]


@router.get("/submissions/{submission_id}", response_model=SubmissionDetail)
async def get_submission(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> SubmissionDetail:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    detail = SubmissionDetail.model_validate(sub)
    detail.files = [SubmissionFileOut.model_validate(f) for f in await repo.list_files(sub.id)]
    return detail


@router.get(
    "/submissions/{submission_id}/files", response_model=list[SubmissionFileOut]
)
async def list_files(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionFileOut]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    return [SubmissionFileOut.model_validate(f) for f in await repo.list_files(sub.id)]


@router.get(
    "/submissions/{submission_id}/files/{file_id}",
    response_model=SubmissionFileOut,
)
async def get_file_meta(
    submission_id: str, file_id: str, user: CurrentUser, session: SessionDep
) -> SubmissionFileOut:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    f = await repo.get_file(file_id)
    if f is None or f.submission_id != submission_id:
        raise not_found("File not found")
    return SubmissionFileOut.model_validate(f)


@router.get("/submissions/{submission_id}/files/{file_id}/content")
async def get_file_content(
    submission_id: str,
    file_id: str,
    user: CurrentUser,
    session: SessionDep,
    storage: StorageDep,
    request: Request,
    as_: str | None = Query(default=None, alias="as"),
) -> Response:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    f = await repo.get_file(file_id)
    if f is None or f.submission_id != submission_id:
        raise not_found("File not found")
    bucket = f.storage_uri.removeprefix("s3://").split("/", 1)[0]
    key = f.storage_uri.removeprefix("s3://").split("/", 1)[1]
    raw = await storage.get_object(bucket=bucket, key=key)
    if as_ == "highlighted":
        # Minimal HTML escaping; real impl would call pygments. We avoid heavy
        # dependency here and produce a <pre>-wrapped escaped block.
        text = raw.decode("utf-8", errors="replace")
        escaped = (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )
        html = f'<pre class="lang-{sub.language or "plain"}">{escaped}</pre>'
        return Response(content=html, media_type="text/html; charset=utf-8")
    if (f.mime_type or "").startswith("text/") or sub.language is not None:
        return PlainTextResponse(raw.decode("utf-8", errors="replace"))
    return Response(content=raw, media_type=f.mime_type or "application/octet-stream")


@router.get("/submissions/{submission_id}/diff")
async def diff_submission(
    submission_id: str,
    user: CurrentUser,
    session: SessionDep,
    storage: StorageDep,
    against: str = Query(..., description="other submission id"),
) -> dict[str, Any]:
    repo = SubmissionRepository(session)
    a = await repo.get(submission_id)
    b = await repo.get(against)
    if a is None or b is None:
        raise not_found("Submission(s) not found")
    ensure_can_modify_submission(user, a)
    ensure_can_modify_submission(user, b)
    a_files = await repo.list_files(a.id)
    b_files = await repo.list_files(b.id)

    async def _read(file: Any) -> str:
        bucket = file.storage_uri.removeprefix("s3://").split("/", 1)[0]
        key = file.storage_uri.removeprefix("s3://").split("/", 1)[1]
        try:
            data = await storage.get_object(bucket=bucket, key=key)
            return data.decode("utf-8", errors="replace")
        except Exception:
            return ""

    pairs: list[dict[str, Any]] = []
    by_path_b = {f.path: f for f in b_files}
    for fa in a_files:
        fb = by_path_b.get(fa.path)
        if fb is None:
            continue
        ta = await _read(fa)
        tb = await _read(fb)
        diff = list(
            difflib.unified_diff(
                ta.splitlines(),
                tb.splitlines(),
                fromfile=f"a/{fa.path}",
                tofile=f"b/{fb.path}",
                lineterm="",
            )
        )
        pairs.append({"path": fa.path, "diff": "\n".join(diff)})
    return {"submission_id": a.id, "against": b.id, "files": pairs}


@router.get(
    "/submissions/{submission_id}/history", response_model=list[SubmissionOut]
)
async def submission_history(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_view_submission(user, sub)
    versions = await repo.list_versions_for_author(
        assignment_id=sub.assignment_id,
        author_id=sub.author_id,
        tenant_id=sub.tenant_id,
    )
    return [SubmissionOut.model_validate(s) for s in versions]


# ---------- B. write ----------


@router.post(
    "/assignments/{assignment_id}/submissions",
    response_model=SubmissionOut,
    status_code=201,
)
async def create_submission(
    assignment_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
    request: Request,
    files: Annotated[list[UploadFile], File()] = ...,
    author_id: Annotated[str | None, Form()] = None,
    language: Annotated[str | None, Form()] = None,
    source: Annotated[str, Form()] = "manual",
    description: Annotated[str | None, Form()] = None,
    external_url: Annotated[str | None, Form()] = None,
    course_id: Annotated[str | None, Form()] = None,
) -> Response:
    """Manual upload (multipart). When dedup hit — returns 200 with same id."""
    target_author = author_id or (user.user_id if user.global_role == "student" else None)
    # Forward the user's bearer to the course service so HttpCourseClient can
    # authenticate. Service-to-service auth keeps the same JWT chain.
    auth_header = request.headers.get("authorization") or ""
    auth_token = auth_header.removeprefix("Bearer ").strip() if auth_header.lower().startswith("bearer ") else None
    # Resolve course_id from the assignment via the course client when not
    # provided explicitly. Falls back to the legacy placeholder.
    if course_id:
        target_course = course_id
    else:
        from submission_service.api.deps import get_course_client
        client = get_course_client()
        info = await client.get_assignment(assignment_id, auth_token=auth_token)
        target_course = (info.course_id if info else None) or "crs_unknown"
    ensure_tenant(user, user.tenant_id)
    ensure_can_create_submission(user, target_course, target_author)

    upload_files: list[SvcUploadFile] = []
    for uf in files:
        content = await uf.read()
        upload_files.append(
            SvcUploadFile(
                filename=uf.filename or "file",
                content=content,
                mime_type=uf.content_type,
            )
        )

    tenant_slug = tenant_slug_from_request(request, user)
    result = await service.create_manual(
        tenant_id=user.tenant_id,
        tenant_slug=tenant_slug,
        course_id=target_course,
        assignment_id=assignment_id,
        author_id=target_author,
        language=language,
        source=source,
        description=description,
        external_url=external_url,
        files=upload_files,
        actor_user_id=user.user_id,
        auth_token=auth_token,
    )
    out = SubmissionOut.model_validate(result.submission).model_dump(mode="json")
    if not result.deduplicated:
        await _publish(
            publisher,
            type_="submission.submission.created.v1",
            sub=result.submission,
            actor={"type": "user", "id": user.user_id, "role": user.global_role},
        )
    code = 200 if result.deduplicated else 201
    return Response(
        content=__import__("json").dumps(out),
        status_code=code,
        media_type="application/json",
        headers={"Location": f"/api/v1/submissions/{result.submission.id}"},
    )


@router.delete("/submissions/{submission_id}", status_code=204)
async def delete_submission(
    submission_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
) -> Response:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_delete_submission(user, sub)
    await service.soft_delete(sub, actor_user_id=user.user_id)
    await _publish(
        publisher,
        type_="submission.submission.deleted.v1",
        sub=sub,
        actor={"type": "user", "id": user.user_id, "role": user.global_role},
    )
    return Response(status_code=204)


@router.post("/submissions/{submission_id}:select", response_model=SubmissionOut)
async def select_submission(
    submission_id: str, user: CurrentUser, service: SubmissionServiceDep
) -> SubmissionOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    await service.select(sub)
    return SubmissionOut.model_validate(sub)


@router.post(
    "/submissions/{submission_id}:unselect", response_model=SubmissionOut
)
async def unselect_submission(
    submission_id: str, user: CurrentUser, service: SubmissionServiceDep
) -> SubmissionOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    await service.unselect(sub)
    return SubmissionOut.model_validate(sub)


@router.post("/submissions/{submission_id}:flag", response_model=SubmissionOut)
async def flag_submission(
    submission_id: str,
    payload: FlagPayload,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> SubmissionOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    await service.add_flag(
        sub, kind=payload.kind, reason=payload.reason, set_by=user.user_id
    )
    return SubmissionOut.model_validate(sub)


@router.post("/submissions/{submission_id}:unflag", response_model=SubmissionOut)
async def unflag_submission(
    submission_id: str,
    payload: FlagPayload,
    user: CurrentUser,
    service: SubmissionServiceDep,
) -> SubmissionOut:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    await service.clear_flag_kind(sub, payload.kind)
    return SubmissionOut.model_validate(sub)


@router.post("/submissions/{submission_id}:rerun-checks", response_model=dict)
async def rerun_checks(
    submission_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
) -> dict[str, Any]:
    sub = await service.repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    ensure_can_modify_submission(user, sub)
    # Emit fresh "created" event on this submission — Plagiarism + AI listen.
    await _publish(
        publisher,
        type_="submission.submission.created.v1",
        sub=sub,
        actor={"type": "user", "id": user.user_id, "role": user.global_role},
    )
    return {"submission_id": sub.id, "rerun": True}
