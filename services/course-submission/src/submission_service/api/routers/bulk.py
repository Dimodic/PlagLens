"""Bulk operations (section G of 06-SUBMISSION.md). Always 202 + Operation."""
from __future__ import annotations

import io
import zipfile
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, File, Form, Request, Response, UploadFile

from submission_service.api.deps import (
    CourseDep,
    CurrentUser,
    PublisherDep,
    SessionDep,
    SubmissionServiceDep,
    tenant_slug_from_request,
)
from submission_service.common import ids
from submission_service.common.events import build_event
from submission_service.common.operation import OperationCreated
from submission_service.common.problem import forbidden, not_found, validation_error
from submission_service.common.rbac import (
    ensure_can_modify_submission,
    ensure_course_staff,
)
from submission_service.models.submission import Operation
from submission_service.repositories.submission_repo import (
    OperationRepository,
    SubmissionRepository,
)
from submission_service.schemas.feedback import BatchPublishIn
from submission_service.schemas.grading import BulkGradeIn
from submission_service.schemas.submission import (
    BatchImportRequestIn,
    BatchImportResult,
    BatchImportResultItem,
    ClaimExternalRequest,
    ClaimExternalResult,
    DistributeRequest,
    DistributeResult,
    MigrateExternalAuthorsRequest,
    MigrateExternalAuthorsResult,
    SelectionRule,
)
from submission_service.services.submission_service import UploadFile as SvcUploadFile

router = APIRouter()


async def _new_operation(
    session: Any,
    *,
    tenant_id: str,
    kind: str,
    metadata: dict[str, Any] | None = None,
) -> Operation:
    op = Operation(
        id=ids.operation_id(),
        tenant_id=tenant_id,
        kind=kind,
        status="completed",
        progress={"completed": 0, "total": 0, "percent": 0.0},
        metadata_=metadata or {},
        finished_at=datetime.now(UTC),
    )
    repo = OperationRepository(session)
    await repo.create(op)
    return op


@router.post(
    "/assignments/{assignment_id}/submissions:batchCreate",
    status_code=202,
)
async def batch_create_submissions(
    assignment_id: str,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
    session: SessionDep,
    request: Request,
    archive: UploadFile = File(..., description="zip with per-author folders"),
    course_id: str = Form(...),
    language: str | None = Form(default=None),
    source: str = Form(default="manual"),
) -> Response:
    ensure_course_staff(user, course_id)
    raw = await archive.read()
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile:
        raise validation_error("Uploaded file is not a valid zip")

    by_author: dict[str, list[SvcUploadFile]] = {}
    for name in zf.namelist():
        if name.endswith("/"):
            continue
        parts = name.split("/", 1)
        if len(parts) < 2:
            continue
        author, rel = parts
        with zf.open(name) as fh:
            data = fh.read()
        by_author.setdefault(author, []).append(
            SvcUploadFile(filename=rel, content=data, mime_type=None)
        )

    tenant_slug = tenant_slug_from_request(request, user)
    created = 0
    skipped = 0
    for author_id, files in by_author.items():
        result = await service.create_manual(
            tenant_id=user.tenant_id,
            tenant_slug=tenant_slug,
            course_id=course_id,
            assignment_id=assignment_id,
            author_id=author_id,
            language=language,
            source=source,
            description=None,
            external_url=None,
            files=files,
            actor_user_id=user.user_id,
        )
        if result.deduplicated:
            skipped += 1
        else:
            created += 1
            await publisher.publish(
                build_event(
                    type_="plaglens.submission.submission.created.v1",
                    tenant_id=user.tenant_id,
                    subject=f"submissions/{result.submission.id}",
                    data={
                        "submission_id": result.submission.id,
                        "assignment_id": assignment_id,
                        "author_id": author_id,
                    },
                    actor={"type": "user", "id": user.user_id, "role": user.global_role},
                )
            )
    op = await _new_operation(
        session,
        tenant_id=user.tenant_id,
        kind="submission_batch_create",
        metadata={
            "assignment_id": assignment_id,
            "created": created,
            "skipped": skipped,
        },
    )
    body = OperationCreated(
        operation_id=op.id, status_url=f"/api/v1/operations/{op.id}"
    ).model_dump()
    return Response(
        content=__import__("json").dumps(body),
        status_code=202,
        media_type="application/json",
        headers={"Location": f"/api/v1/operations/{op.id}"},
    )


@router.post(
    "/assignments/{assignment_id}/submissions:batchImport",
    status_code=200,
    response_model=BatchImportResult,
)
async def batch_import_submissions(
    assignment_id: str,
    payload: BatchImportRequestIn,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
    session: SessionDep,
    request: Request,
) -> BatchImportResult:
    """Programmatic counterpart to :batchCreate (ZIP).

    Accepts a JSON list of submissions whose author_id is already resolved
    (callers — e.g. integration-service — do the login→user_id lookup via
    identity-service first). Each item is funnelled through
    ``SubmissionService.create_manual`` so dedup, version bump, late-detection,
    and event emission all work identically to a teacher uploading a ZIP.

    Use this for Yandex.Contest / Stepik / Ejudge pulls — anything where the
    caller already has structured `(login, language, code, submitted_at)` data
    rather than a zipped folder.
    """
    ensure_course_staff(user, payload.course_id)
    tenant_slug = tenant_slug_from_request(request, user)

    # admin can act cross-tenant (e.g. background importers
    # using a service token). Resolve the target tenant from the assignment
    # itself so submissions don't end up in the system tenant when an
    # integration service authenticates as admin.
    target_tenant_id = user.tenant_id
    if user.is_admin:
        # Forward the caller's bearer so course-service authorises the read.
        auth_hdr = request.headers.get("authorization") or ""
        token = (
            auth_hdr.split(" ", 1)[1]
            if auth_hdr.lower().startswith("bearer ")
            else None
        )
        info = await service.course_client.get_assignment(
            assignment_id, auth_token=token
        )
        if info and info.tenant_id and info.tenant_id != target_tenant_id:
            target_tenant_id = info.tenant_id

    created = 0
    deduplicated = 0
    skipped = 0
    failed = 0
    items_out: list[BatchImportResultItem] = []

    # Version numbers are assigned ``max_version + 1`` per author as rows
    # are created, so the import order *is* the version order. An external
    # batch (Yandex.Contest etc.) often arrives newest-first — importing it
    # as-is numbered the freshest attempt v1 and the oldest vN, the reverse
    # of what the UI expects. Sort chronologically so v1 is the earliest
    # attempt and the highest version is the latest. Items without a
    # ``submitted_at`` sink to the end (treated as "just now").
    _far_future = datetime.max.replace(tzinfo=UTC)
    ordered_items = sorted(
        payload.items,
        key=lambda it: it.submitted_at or _far_future,
    )

    for item in ordered_items:
        if not item.author_id:
            failed += 1
            items_out.append(
                BatchImportResultItem(
                    external_id=item.external_id,
                    author_login=item.author_login,
                    status="failed",
                    reason="author_id missing (caller must pre-resolve login→user)",
                )
            )
            continue

        files = [
            SvcUploadFile(
                filename=f.path,
                content=f.content.encode("utf-8"),
                mime_type=f.mime_type,
            )
            for f in item.files
        ]
        try:
            result = await service.create_manual(
                tenant_id=target_tenant_id,
                tenant_slug=tenant_slug,
                course_id=payload.course_id,
                assignment_id=assignment_id,
                author_id=item.author_id,
                language=item.language,
                source=payload.source,
                description=None,
                external_url=item.external_url,
                files=files,
                actor_user_id=user.user_id,
                external_id=item.external_id,
                submitted_at=item.submitted_at,
                # Persist the display label (login/full name) for non-user
                # authors so the UI doesn't fall back to opaque IDs.
                author_label=item.author_label or item.author_login,
                rebind_existing=payload.rebind_existing,
                # Carry the remote verdict/score through — the importer
                # used to drop these, leaving external_verdict NULL for
                # every row, so "latest OK submission" had nothing to
                # filter on.
                external_verdict=item.external_verdict,
                external_score=item.external_score,
            )
        except Exception as exc:  # noqa: BLE001 — we surface every failure
            failed += 1
            items_out.append(
                BatchImportResultItem(
                    external_id=item.external_id,
                    author_login=item.author_login,
                    status="failed",
                    reason=str(exc)[:200],
                )
            )
            continue

        if result.deduplicated:
            deduplicated += 1
            items_out.append(
                BatchImportResultItem(
                    external_id=item.external_id,
                    author_login=item.author_login,
                    submission_id=result.submission.id,
                    status="deduplicated",
                )
            )
            continue

        created += 1
        items_out.append(
            BatchImportResultItem(
                external_id=item.external_id,
                author_login=item.author_login,
                submission_id=result.submission.id,
                status="created",
            )
        )
        # Same event the ZIP path emits — downstream services (plagiarism,
        # ai-analysis) listen for this and don't care how the data arrived.
        await publisher.publish(
            build_event(
                type_="plaglens.submission.submission.created.v1",
                tenant_id=user.tenant_id,
                subject=f"submissions/{result.submission.id}",
                data={
                    "submission_id": result.submission.id,
                    "assignment_id": assignment_id,
                    "author_id": item.author_id,
                    "source": payload.source,
                    "external_id": item.external_id,
                },
                actor={"type": "user", "id": user.user_id, "role": user.global_role},
            )
        )

    op = await _new_operation(
        session,
        tenant_id=user.tenant_id,
        kind="submission_batch_import",
        metadata={
            "assignment_id": assignment_id,
            "source": payload.source,
            "created": created,
            "deduplicated": deduplicated,
            "skipped": skipped,
            "failed": failed,
        },
    )

    return BatchImportResult(
        created=created,
        deduplicated=deduplicated,
        skipped=skipped,
        failed=failed,
        operation_id=op.id,
        items=items_out,
    )


@router.post(
    "/assignments/{assignment_id}/grades:batchUpdate", status_code=202
)
async def batch_update_grades(
    assignment_id: str,
    payload: BulkGradeIn,
    user: CurrentUser,
    service: SubmissionServiceDep,
    publisher: PublisherDep,
    session: SessionDep,
    course: CourseDep,
) -> Response:
    assignment = await course.get_assignment(assignment_id)
    updated = 0
    failed = 0
    for item in payload.items:
        sub = await service.repo.get(item.submission_id)
        if sub is None or sub.assignment_id != assignment_id:
            failed += 1
            continue
        try:
            ensure_can_modify_submission(user, sub)
        except Exception:  # noqa: S112
            failed += 1
            continue
        await service.set_grade(
            sub=sub,
            score=item.score,
            max_score=None,
            comment_visible_to_student=item.comment_visible_to_student,
            graded_by=user.user_id,
            assignment=assignment,
        )
        await publisher.publish(
            build_event(
                type_="plaglens.submission.grade.assigned.v1",
                tenant_id=sub.tenant_id,
                subject=f"submissions/{sub.id}",
                data={"submission_id": sub.id, "score": item.score},
                actor={"type": "user", "id": user.user_id, "role": user.global_role},
            )
        )
        updated += 1
    op = await _new_operation(
        session,
        tenant_id=user.tenant_id,
        kind="grade_batch_update",
        metadata={"updated": updated, "failed": failed},
    )
    return Response(
        content=__import__("json").dumps(
            OperationCreated(
                operation_id=op.id, status_url=f"/api/v1/operations/{op.id}"
            ).model_dump()
        ),
        status_code=202,
        media_type="application/json",
        headers={"Location": f"/api/v1/operations/{op.id}"},
    )


@router.post(
    "/assignments/{assignment_id}/feedback:batchPublish", status_code=202
)
async def batch_publish_feedback(
    assignment_id: str,
    payload: BatchPublishIn,
    user: CurrentUser,
    service: SubmissionServiceDep,
    session: SessionDep,
) -> Response:
    published = await service.bulk_publish_feedback(payload.submission_ids)
    op = await _new_operation(
        session,
        tenant_id=user.tenant_id,
        kind="feedback_batch_publish",
        metadata={"published": len(published)},
    )
    return Response(
        content=__import__("json").dumps(
            OperationCreated(
                operation_id=op.id, status_url=f"/api/v1/operations/{op.id}"
            ).model_dump()
        ),
        status_code=202,
        media_type="application/json",
        headers={"Location": f"/api/v1/operations/{op.id}"},
    )


@router.post(
    "/assignments/{assignment_id}/submissions:batchSelect", status_code=202
)
async def batch_select_submissions(
    assignment_id: str,
    payload: SelectionRule,
    user: CurrentUser,
    service: SubmissionServiceDep,
    session: SessionDep,
    course: CourseDep,
) -> Response:
    repo = SubmissionRepository(session)
    selected = 0
    if payload.rule == "by_id":
        for sid in payload.ids:
            sub = await repo.get(sid)
            if sub is None or sub.assignment_id != assignment_id:
                continue
            try:
                ensure_can_modify_submission(user, sub)
            except Exception:  # noqa: S112
                continue
            await service.select(sub)
            selected += 1
    else:
        # last/best — rebuild for every author
        latest = await repo.list_latest_per_student(
            assignment_id=assignment_id, tenant_id=user.tenant_id
        )
        if latest:
            ensure_course_staff(user, latest[0].course_id)
        assignment = await course.get_assignment(assignment_id)
        for sub in latest:
            if assignment is not None:
                # update_selected respects "last"/"best" automatically;
                # build an explicit stub to override selection_strategy.
                from submission_service.services.course_client import (
                    AssignmentInfo,
                )

                stub = AssignmentInfo(
                    id=assignment.id,
                    course_id=assignment.course_id,
                    tenant_id=assignment.tenant_id,
                    deadline_soft_at=assignment.deadline_soft_at,
                    deadline_hard_at=assignment.deadline_hard_at,
                    late_score_multiplier=assignment.late_score_multiplier,
                    selection_strategy=payload.rule,
                    visible_to_students_at=assignment.visible_to_students_at,
                    max_score=assignment.max_score,
                )
                await service.update_selected(sub, stub)
                selected += 1
    op = await _new_operation(
        session,
        tenant_id=user.tenant_id,
        kind="submission_batch_select",
        metadata={"selected": selected, "rule": payload.rule},
    )
    return Response(
        content=__import__("json").dumps(
            OperationCreated(
                operation_id=op.id, status_url=f"/api/v1/operations/{op.id}"
            ).model_dump()
        ),
        status_code=202,
        media_type="application/json",
        headers={"Location": f"/api/v1/operations/{op.id}"},
    )


# ---- distribute submissions across assistants (round-robin) ----


@router.post("/submissions:distribute", response_model=DistributeResult)
async def distribute_submissions(
    payload: DistributeRequest,
    user: CurrentUser,
    session: SessionDep,
) -> DistributeResult:
    """Round-robin a course's or an assignment's submissions across the
    given assistants. Scope is exactly one of ``course_id`` /
    ``assignment_id``. Only the latest version per student that isn't
    already assigned gets a grader — re-running leaves work assistants
    may have already started in place. Synchronous (just a bulk UPDATE),
    so it returns the result directly rather than a 202 + Operation.
    """
    if bool(payload.course_id) == bool(payload.assignment_id):
        raise validation_error(
            "Pass exactly one of course_id / assignment_id"
        )

    repo = SubmissionRepository(session)
    if payload.assignment_id:
        latest = await repo.list_latest_per_student(
            assignment_id=payload.assignment_id, tenant_id=user.tenant_id
        )
    else:
        latest = await repo.list_latest_per_student_for_course(
            course_id=payload.course_id or "", tenant_id=user.tenant_id
        )

    # RBAC — course staff only. Prefer the explicit course_id; otherwise
    # derive it from a submission. With no submissions there's nothing to
    # leak, so an empty scope short-circuits.
    if payload.course_id:
        ensure_course_staff(user, payload.course_id)
    elif latest:
        ensure_course_staff(user, latest[0].course_id)

    graders = payload.graders
    if not latest:
        return DistributeResult(
            assigned=0, graders=len(graders), skipped=0
        )

    # Touch only the unassigned ones — keep already-distributed work put.
    pending = [s for s in latest if not s.assigned_grader_id]
    skipped = len(latest) - len(pending)

    # Weighted allocation. Graders with weight==0 are excluded outright.
    # For each pending submission, pick the grader with the lowest
    # projected `(count+1)/weight` ratio — produces fair proportional
    # allocation that converges to weights[i]/sum(weights) over many
    # rows. With every weight=1 it degenerates to the previous
    # round-robin behaviour.
    active = [g for g in graders if g.weight > 0]
    if not active:
        return DistributeResult(
            assigned=0, graders=len(graders), skipped=skipped
        )
    counts: dict[str, int] = {g.id: 0 for g in active}
    updates: dict[str, tuple[str, str]] = {}
    for sub in pending:
        best = min(active, key=lambda g: (counts[g.id] + 1) / g.weight)
        counts[best.id] += 1
        updates[sub.id] = (best.id, best.name)
    assigned = await repo.assign_graders(updates)
    await session.commit()
    return DistributeResult(
        assigned=assigned, graders=len(active), skipped=skipped
    )


# ---- external-identity claim (Yandex.Contest participant → user) ----


@router.post("/submissions:claim-external", response_model=ClaimExternalResult)
async def claim_external_submissions(
    payload: ClaimExternalRequest,
    user: CurrentUser,
    session: SessionDep,
) -> ClaimExternalResult:
    """Backfill an external participant's imported submissions to a user.

    Called service-to-service by identity when a student redeems a binding
    claim code. The caller mints an **admin**-impersonation JWT, so we gate on
    ``global_role == admin``. The tenant comes from the token (never the body)
    and scopes the bulk UPDATE, so identity can only ever rewrite rows inside
    the redeemer's own tenant. Lives under ``/submissions:claim-external``
    (not ``/users/{id}/...``) so the gateway routes it here, not to identity.
    Synchronous bulk UPDATE → returns the count directly.
    """
    if not user.is_admin:
        raise forbidden("Admin role required")
    repo = SubmissionRepository(session)
    claimed = await repo.claim_external(
        tenant_id=user.tenant_id,
        user_id=payload.user_id,
        external_author_id=payload.external_author_id,
    )
    await session.commit()
    return ClaimExternalResult(claimed=claimed)


@router.post(
    "/submissions:migrate-external-authors",
    response_model=MigrateExternalAuthorsResult,
)
async def migrate_external_authors(
    payload: MigrateExternalAuthorsRequest,
    user: CurrentUser,
    session: SessionDep,
) -> MigrateExternalAuthorsResult:
    """Bulk-reconcile Yandex.Contest author ids on imported submissions.

    Called service-to-service by integration-service's one-shot author-id
    migration with an **admin** service JWT (same auth as
    ``:claim-external``). The tenant comes from the token — never the body —
    and scopes both passes, so the importer can only ever rewrite rows in its
    own tenant.

      * ``remaps`` — rename each ``yc:<participantId>`` author_id to the
        stable ``yc:<login>`` form.
      * ``claims`` — reattribute each now-stable ``yc:<login>`` (or any
        external key) to the bound PlagLens ``user_id``; ``claims`` is the
        binding list identity-service returned for this tenant.

    Synchronous bulk UPDATE → returns the counts directly. Idempotent.
    """
    if not user.is_admin:
        raise forbidden("Admin role required")
    repo = SubmissionRepository(session)
    submissions_updated, claimed = await repo.migrate_external_authors(
        tenant_id=user.tenant_id,
        remaps=[(r.from_, r.to) for r in payload.remaps],
        claims=[(c.external_id, c.user_id) for c in payload.claims],
    )
    await session.commit()
    return MigrateExternalAuthorsResult(
        submissions_updated=submissions_updated, claimed=claimed
    )


# ---- read-side: GET /operations/{id} for clients to poll ----


@router.get("/operations/{op_id}")
async def get_operation(
    op_id: str, user: CurrentUser, session: SessionDep
) -> dict[str, Any]:
    repo = OperationRepository(session)
    op = await repo.get(op_id)
    if op is None:
        raise not_found("Operation not found")
    if op.tenant_id != user.tenant_id and not user.is_admin:
        raise forbidden("Cross-tenant access denied")
    return {
        "id": op.id,
        "kind": op.kind,
        "status": op.status,
        "progress": op.progress,
        "started_at": op.started_at,
        "updated_at": op.updated_at,
        "finished_at": op.finished_at,
        "result_url": op.result_url,
        "error": op.error,
        "metadata": op.metadata_,
    }
