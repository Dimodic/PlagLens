"""§E — suspicious flag endpoints."""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from plaglens_common.errors import PlagLensError
from plaglens_common.service_client import ServiceClient
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.logging import get_logger
from ...common.problem import not_found
from ...common.rbac import Principal, assert_course_role, assert_tenant
from ...config import settings
from ...schemas.suspicious import (
    PairedAuthor,
    SuspiciousFlagCreate,
    SuspiciousFlagDismiss,
    SuspiciousFlagItem,
)
from ...services.suspicious_service import SuspiciousService
from ..deps import get_db, get_principal_dep

router = APIRouter(tags=["suspicious"])
log = get_logger(__name__)


def _author_from_meta(meta: dict) -> tuple[str | None, str | None]:
    """Best-effort `(author_id, display_name)` from a submission payload.
    Falls back through the linked-user object → top-level author_id →
    YC-style `author_label` so rows for external participants still
    show a real name."""
    author_id: str | None = None
    display_name: str | None = None
    author_obj = meta.get("author")
    if isinstance(author_obj, dict):
        author_id = author_obj.get("id") or meta.get("author_id")
        display_name = author_obj.get("display_name")
    author_id = author_id or meta.get("author_id")
    display_name = (
        display_name
        or meta.get("author_display_name")
        or meta.get("author_label")
    )
    return author_id, display_name


def _to_item(
    flag, sub_meta_by_id: dict[str, dict] | None = None
) -> SuspiciousFlagItem:
    """Build the public response item. When ``sub_meta_by_id`` is
    supplied (the course list endpoint enriches with one parallel
    fan-out to the submission service), we attach author / assignment
    fields for the row's own submission **and** for every ID in
    ``paired_with`` so the frontend can render «совпало с ФИО»."""
    sub_meta_by_id = sub_meta_by_id or {}
    own_meta = sub_meta_by_id.get(flag.submission_id) or {}
    author_id, author_display_name = (
        _author_from_meta(own_meta) if own_meta else (None, None)
    )
    assignment_id = own_meta.get("assignment_id") if own_meta else None
    peers: list[PairedAuthor] = []
    for peer_sid in flag.paired_with or []:
        peer_meta = sub_meta_by_id.get(peer_sid)
        if peer_meta:
            peer_id, peer_name = _author_from_meta(peer_meta)
        else:
            peer_id, peer_name = (None, None)
        peers.append(
            PairedAuthor(
                submission_id=peer_sid,
                author_id=peer_id,
                display_name=peer_name,
            )
        )
    return SuspiciousFlagItem(
        id=flag.id,
        flag_id=flag.id,
        submission_id=flag.submission_id,
        run_id=flag.run_id,
        reason=flag.reason,
        severity=flag.severity,  # type: ignore[arg-type]
        similarity=flag.similarity,
        paired_with=list(flag.paired_with or []),
        created_at=flag.created_at,
        created_by=flag.created_by,
        cleared_at=flag.cleared_at,
        cleared_by=flag.cleared_by,
        dismiss_reason=flag.dismiss_reason,
        author_id=author_id,
        author_display_name=author_display_name,
        assignment_id=assignment_id,
        paired_with_authors=peers,
    )


async def _resolve_submission_meta(
    bearer: str | None,
    submission_ids: list[str],
) -> dict[str, dict]:
    """Fan out to ``GET /api/v1/submissions/{id}`` in parallel and
    return a `{submission_id: payload}` map. Best-effort: any 4xx /
    network error simply omits that submission from the map and the
    caller falls back to the bare ID placeholder. We forward the
    user's bearer token instead of minting a service one — the user
    already has access to the course (RBAC was checked above) so the
    submission service will accept the same identity."""
    if not submission_ids or not bearer:
        return {}
    base = settings.submission_service_base.rstrip("/")
    headers = {"Authorization": bearer}
    out: dict[str, dict] = {}

    async def fetch(client: ServiceClient, sid: str) -> None:
        try:
            resp = await client.get(
                f"{base}/api/v1/submissions/{sid}", headers=headers
            )
            payload = resp.json()
            if isinstance(payload, dict):
                out[sid] = payload
        except (PlagLensError, ValueError) as exc:  # pragma: no cover
            log.debug("suspicious_enrich_fail", submission_id=sid, error=str(exc))

    # Bound the concurrency a bit so we don't hammer submission with
    # 200 simultaneous sockets if a teacher has lots of flags.
    sem = asyncio.Semaphore(20)

    async def guarded(client: ServiceClient, sid: str) -> None:
        async with sem:
            await fetch(client, sid)

    async with ServiceClient(
        base, provider="submission-service", timeout=4.0
    ) as client:
        await asyncio.gather(*(guarded(client, sid) for sid in submission_ids))
    return out


@router.get("/courses/{course_id}/suspicious-submissions")
async def list_course_suspicious(
    course_id: str,
    request: Request,
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    svc = SuspiciousService(db)
    flags = await svc.list_active(principal.tenant_id)
    # Collect the row's own submission_id AND every peer in
    # `paired_with` — one fan-out covers both so we can render
    # «совпало с ФИО» without an extra HTTP round-trip per row.
    unique_sub_ids: set[str] = set()
    for f in flags:
        unique_sub_ids.add(f.submission_id)
        for peer in f.paired_with or []:
            unique_sub_ids.add(peer)
    bearer = request.headers.get("authorization")
    sub_meta = await _resolve_submission_meta(bearer, list(unique_sub_ids))
    return {"data": [_to_item(f, sub_meta).model_dump() for f in flags]}


@router.get("/assignments/{assignment_id}/suspicious-submissions")
async def list_assignment_suspicious(
    assignment_id: str,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    svc = SuspiciousService(db)
    # Collect all submission ids from pairs of any run for this assignment.
    # Simpler approach: list all flags for tenant — caller may filter.
    flags = await svc.list_active(principal.tenant_id)
    return {"data": [_to_item(f).model_dump() for f in flags if f.run_id]}


@router.get("/submissions/{submission_id}/suspicious-flags")
async def list_submission_flags(
    submission_id: str,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    svc = SuspiciousService(db)
    flags = await svc.list_for_submission(
        submission_id=submission_id, tenant_id=principal.tenant_id
    )
    return {"data": [_to_item(f).model_dump() for f in flags]}


@router.post("/submissions/{submission_id}/suspicious-flags", status_code=201)
async def create_flag(
    submission_id: str,
    body: SuspiciousFlagCreate,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    svc = SuspiciousService(db)
    flag = await svc.manual_create(
        tenant_id=principal.tenant_id,
        submission_id=submission_id,
        reason=body.reason,
        severity=body.severity,
        created_by=principal.user_id,
        similarity=body.similarity,
        paired_with=body.paired_with,
    )
    await db.commit()
    return _to_item(flag).model_dump()


@router.delete(
    "/submissions/{submission_id}/suspicious-flags/{flag_id}", status_code=204
)
async def delete_flag(
    submission_id: str,
    flag_id: str,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> None:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    svc = SuspiciousService(db)
    flag = await svc.repo.get(flag_id)
    if flag is None or flag.submission_id != submission_id:
        raise not_found(f"Flag {flag_id} not found")
    assert_tenant(principal, flag.tenant_id)
    await svc.clear(flag_id, cleared_by=principal.user_id)
    await db.commit()


@router.post(
    "/submissions/{submission_id}/suspicious-flags/{flag_id}:dismiss", status_code=200
)
async def dismiss_flag(
    submission_id: str,
    flag_id: str,
    body: SuspiciousFlagDismiss,
    course_id: str | None = Query(default=None),
    principal: Principal = Depends(get_principal_dep),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    assert_course_role(principal, course_id, ("owner", "co_owner", "assistant"))
    svc = SuspiciousService(db)
    flag = await svc.repo.get(flag_id)
    if flag is None or flag.submission_id != submission_id:
        raise not_found(f"Flag {flag_id} not found")
    assert_tenant(principal, flag.tenant_id)
    cleared = await svc.dismiss(
        flag_id, cleared_by=principal.user_id, reason=body.reason
    )
    await db.commit()
    if cleared is None:
        raise not_found(f"Flag {flag_id} already cleared")
    return _to_item(cleared).model_dump()
