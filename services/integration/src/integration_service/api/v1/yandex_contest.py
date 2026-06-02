"""Yandex.Contest-specific endpoints (§D).

The import-job *orchestration* (job lifecycle, the Redis operation state, the
``(course, contest) → homework`` idempotency mapping and the background
workers) lives in :mod:`integration_service.services.yc_import`. This module is
now just the HTTP surface: it authorises the caller, resolves the target
course, kicks off the service-layer workers and shapes the responses.
"""
from __future__ import annotations

import asyncio
from dataclasses import asdict
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, Request
from plaglens_common.service_client import ServiceClient
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.yandex_contest import YandexContestAdapter
from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.problems import ProblemException, not_found
from integration_service.config import get_settings
from integration_service.deps import principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo
from integration_service.services.oauth import get_access_token
from integration_service.services.service_token import (
    auth_headers as service_auth_headers,
)
from integration_service.services.service_token import (
    auth_headers_for_tenant as service_auth_headers_for_tenant,
)
from integration_service.services.yc_import import (
    create_assignments_from_problems,
    drop_imported_homework,
    homework_exists,
    imported_homework_id,
    op_create,
    op_get,
    run_import_as_homework,
    run_resync_submissions,
    start_import_job,
)

logger = structlog.get_logger(__name__)


router = APIRouter(prefix="/integrations/yandex-contest", tags=["yandex-contest"])


async def _get_cfg(
    config_id: str,
    p: Principal,
    session: AsyncSession,
    *,
    course_id: str | None = None,
):
    """Load a YC config and authorise the caller.

    Permission check uses the *effective* course — the one the caller is
    actually going to act on. For per-course configs that's
    ``cfg.course_id``. For tenant-wide configs (``cfg.course_id is None``)
    the caller passes the destination course via the query string.
    """
    repo = IntegrationConfigRepo(session)
    cfg = await repo.get(config_id, tenant_id=p.tenant_id)
    if cfg is None:
        raise not_found("IntegrationConfig", config_id)
    if cfg.kind != "yandex_contest":
        raise ProblemException(409, "CONFLICT", "Conflict", "config is not Y.Contest")
    auth_course = cfg.course_id or course_id
    ensure_owner_or_admin(p, auth_course)
    return cfg


@router.get("/{config_id}/contests")
async def list_contests(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """List contests visible to the OAuth token."""
    cfg = await _get_cfg(config_id, p, session)
    adapter = YandexContestAdapter()
    courses = await adapter.list_remote_courses(cfg)
    return {"data": [asdict(c) for c in courses]}


@router.get("/{config_id}/contests/{contest_id}/problems")
async def list_problems(
    config_id: str,
    contest_id: int,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """List problems (tasks) of a single contest."""
    cfg = await _get_cfg(config_id, p, session)
    adapter = YandexContestAdapter()
    result = await adapter.import_problems(cfg, {"contest_id": contest_id})
    return {
        "data": [asdict(pr) for pr in result.problems],
        "imported": result.imported,
        "failed": result.failed,
        "errors": result.errors,
    }


@router.post("/{config_id}/contests/{contest_id}/import-problems")
async def import_problems(
    config_id: str,
    contest_id: int,
    request: Request,
    homework_id: str | None = None,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Pull contest problems and turn them into PlagLens assignments under a
    given homework.

    Flow:
      1. ``adapter.import_problems`` — fetch the problem list from Y.C.
      2. For each problem, ``POST /api/v1/homeworks/{hw}/assignments`` on the
         course-service (one call per problem, since the service has no bulk
         endpoint). Per-item failures are reported but don't abort the rest.

    The caller's bearer token is forwarded to course-service for the
    permission check (must be course owner / co_owner). ``homework_id`` is
    required — pass it as a query param.
    """
    cfg = await _get_cfg(config_id, p, session)
    if not homework_id:
        raise ProblemException(
            400,
            "HOMEWORK_REQUIRED",
            "homework_id required",
            "Pass ?homework_id=… to attach problems to a homework",
        )
    if not cfg.course_id:
        raise ProblemException(
            400,
            "COURSE_REQUIRED",
            "config has no bound course_id",
            "Bind this IntegrationConfig to a course before importing problems",
        )
    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise ProblemException(
            401, "UNAUTHENTICATED", "Unauthorized", "Bearer token required"
        )

    adapter = YandexContestAdapter()
    result = await adapter.import_problems(cfg, {"contest_id": contest_id})
    if result.failed and not result.problems:
        return {
            "fetched": 0,
            "created": 0,
            "failed": result.failed,
            "errors": result.errors,
        }

    try:
        hw_id_int = int(homework_id)
    except (TypeError, ValueError):
        hw_id_int = None

    settings = get_settings()
    fwd = {"Authorization": auth_header, "Content-Type": "application/json"}
    async with httpx.AsyncClient(
        timeout=settings.httpx_timeout_seconds
    ) as client:
        created, failed, per_item_errors, _alias_map = (
            await create_assignments_from_problems(
                client,
                course_id=cfg.course_id,
                homework_id=hw_id_int,
                contest_id=contest_id,
                problems=result.problems,
                fwd_headers=fwd,
                course_service_url=settings.course_service_url,
            )
        )

    return {
        "fetched": len(result.problems),
        "created": created,
        "failed": failed + result.failed,
        "errors": result.errors + per_item_errors,
        "homework_id": homework_id,
    }


@router.get("/import-operations/{op_id}")
async def get_import_operation(op_id: str) -> dict[str, Any]:
    """Poll endpoint for the modal: returns the current state of an
    import-as-homework background task (Redis-backed, 24h TTL)."""
    state = await op_get(op_id)
    if state is None:
        return {"status": "expired", "stage": None}
    return state


@router.post("/{config_id}/contests/{contest_id}/import-as-homework")
async def import_as_homework(
    config_id: str,
    contest_id: int,
    request: Request,
    course_id: str | None = None,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Kick off an asynchronous one-shot import: returns 202 + operation_id
    immediately, the actual work (fetch contest meta → create homework →
    import problems → import submissions) runs in the background and
    publishes progress to a Redis-backed state record polled via
    ``GET /import-operations/{op_id}``.

    Course resolution:
      - The destination course is the ``?course_id=`` query param when
        provided. This lets a tenant-wide config (the new mode) serve
        any course in the tenant and also lets a per-course config be
        re-targeted if needed (e.g. after the originally-bound course
        was deleted — otherwise the import would 404 forever).
      - Falls back to ``cfg.course_id`` for legacy callers that didn't
        send the query param.
    """
    cfg = await _get_cfg(config_id, p, session, course_id=course_id)
    effective_course_id = course_id or cfg.course_id
    if not effective_course_id:
        raise ProblemException(
            400,
            "COURSE_REQUIRED",
            "course_id required",
            "Pass ?course_id=… to choose the destination course",
        )

    token = await get_access_token(str(cfg.id)) if cfg.id else None
    if not token and isinstance(cfg.settings, dict):
        token = cfg.settings.get("oauth_token") or cfg.settings.get("access_token")
    if not token:
        raise ProblemException(
            400,
            "NO_OAUTH_TOKEN",
            "no OAuth token; connect first",
            "Run the Yandex.Contest OAuth flow for this integration",
        )

    # Detach from request: snapshot the fields the background task needs.
    # ``course_id`` is the *effective* one (config-bound or query-supplied).
    cfg_snapshot = type(
        "_CfgSnap",
        (),
        {
            "id": cfg.id,
            "tenant_id": cfg.tenant_id,
            "course_id": effective_course_id,
            "settings": cfg.settings,
        },
    )()

    # Idempotent short-circuit: if this contest was already imported into
    # *this* course and the resulting homework is still alive, return its
    # id immediately. Scoped by course_id so a tenant-wide YC config can
    # serve multiple courses without collisions.
    existing_hw_id = imported_homework_id(
        cfg_snapshot, contest_id, course_id=effective_course_id
    )
    if existing_hw_id:
        s = get_settings()
        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
            still_alive = await homework_exists(
                client,
                settings=s,
                homework_id=existing_hw_id,
                fwd_headers=fwd,
            )
        # Additionally make sure the recorded homework actually lives in
        # the requested course — otherwise the legacy-key fallback could
        # point at a homework from a different course (the bug that made
        # this dialog read "already imported" on a fresh course).
        if still_alive:
            async with httpx.AsyncClient(
                timeout=s.httpx_timeout_seconds
            ) as client:
                url = (
                    s.course_service_url.rstrip("/")
                    + f"/api/v1/homeworks/{existing_hw_id}"
                )
                try:
                    resp = await client.get(url, headers=fwd)
                    if resp.status_code == 200:
                        body = resp.json()
                        same_course = (
                            str(body.get("course_id"))
                            == str(effective_course_id)
                        )
                    else:
                        same_course = False
                except httpx.HTTPError:
                    same_course = True  # don't double-create on transient errors
            if not same_course:
                # Mapping pointed at a homework in a different course
                # (legacy unscoped key). Drop it and re-import.
                await drop_imported_homework(
                    config_id=str(cfg.id),
                    contest_id=contest_id,
                    course_id=effective_course_id,
                )
                still_alive = False
        if still_alive:
            # The homework + its assignments already exist — but a prior
            # import may have only *partially* landed (e.g. submissions
            # failed mid-batch). Rather than a dead-end "already imported"
            # no-op, re-run the submission import against the existing
            # assignments: rebuild ``alias → assignment_id`` from their
            # external bindings and re-pull the runs. submission-service
            # dedups by ``external_id``, so this is idempotent — it only
            # backfills whatever a previous run missed.
            op_id = await op_create({
                "stage": "starting",
                "status": "running",
                "contest_id": contest_id,
                "course_id": effective_course_id,
                "homework_id": existing_hw_id,
                "homework_slug": None,
                "homework_title": None,
                "problems_total": 0,
                "problems_done": 0,
                "submissions_fetched": 0,
                "submissions_imported": 0,
                "errors": [],
                "resync": True,
            })
            job_id = await start_import_job(
                config_id=str(cfg.id),
                tenant_id=str(cfg.tenant_id),
                scope={
                    "contest_id": contest_id,
                    "course_id": effective_course_id,
                    "mode": "resync",
                },
                trigger="manual",
            )
            asyncio.create_task(
                run_resync_submissions(
                    op_id=op_id,
                    cfg=cfg_snapshot,
                    contest_id=contest_id,
                    homework_id=str(existing_hw_id),
                    job_id=job_id,
                )
            )
            return {
                "operation_id": op_id,
                "status_url": f"/api/v1/integrations/yandex-contest/import-operations/{op_id}",
                "already_imported": True,
                "homework_id": existing_hw_id,
            }
        # Recorded homework no longer exists — clean the stale mapping
        # before re-importing so the fresh run can store its own.
        await drop_imported_homework(
            config_id=str(cfg.id),
            contest_id=contest_id,
            course_id=effective_course_id,
        )

    op_id = await op_create({
        "stage": "starting",
        "contest_id": contest_id,
        "course_id": cfg.course_id,
        "homework_id": None,
        "homework_slug": None,
        "homework_title": None,
        "problems_total": 0,
        "problems_done": 0,
        "submissions_fetched": 0,
        "submissions_imported": 0,
        "errors": [],
    })
    job_id = await start_import_job(
        config_id=str(cfg.id),
        tenant_id=str(cfg.tenant_id),
        scope={
            "contest_id": contest_id,
            "course_id": effective_course_id,
            "mode": "import_as_homework",
        },
        trigger="manual",
    )

    asyncio.create_task(
        run_import_as_homework(
            op_id=op_id,
            cfg=cfg_snapshot,
            contest_id=contest_id,
            job_id=job_id,
        )
    )
    return {"operation_id": op_id, "status_url": f"/api/v1/integrations/yandex-contest/import-operations/{op_id}"}


@router.get("/{config_id}/contests/{contest_id}/participants")
async def list_participants(
    config_id: str,
    contest_id: int,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Read participants of a single contest. The token must have
    `contest:manage` scope and the user must be admin/jury on that contest."""
    cfg = await _get_cfg(config_id, p, session)
    adapter = YandexContestAdapter()
    result = await adapter.import_participants(cfg, {"contest_id": contest_id})
    return {
        "data": [asdict(p) for p in result.participants],
        "imported": result.imported,
        "failed": result.failed,
        "errors": result.errors,
    }


@router.post("/{config_id}/contests/{contest_id}/import-participants")
async def import_participants(
    config_id: str,
    contest_id: int,
    request: Request,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Import contest participants into PlagLens end-to-end.

    1. Pulls every participant via the Yandex.Contest adapter.
    2. Calls identity-service `POST /v1/users/bulk-import` (dedupe-create).
    3. Calls course-service `POST /v1/courses/{id}/members:batchCreate` (enroll).

    The user's bearer token is forwarded to both downstream services so
    permission checks happen exactly as if the user called them directly.
    """
    cfg = await _get_cfg(config_id, p, session)
    adapter = YandexContestAdapter()
    result = await adapter.import_participants(cfg, {"contest_id": contest_id})
    if result.failed > 0 and not result.participants:
        return {
            "data": [],
            "imported": 0,
            "failed": result.failed,
            "errors": result.errors,
            "course_id": cfg.course_id,
        }

    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise ProblemException(
            401, "UNAUTHENTICATED", "Unauthorized", "Bearer token required"
        )

    settings = get_settings()
    bulk_items = [
        {
            "external_id": rp.external_id,
            "email": rp.email,
            "login": rp.login,
            "display_name": (
                f"{rp.surname or ''} {rp.name or ''}".strip()
                or rp.login
                or rp.external_id
            ),
            "global_role": "student",
        }
        for rp in result.participants
    ]
    fwd_headers = {
        "Authorization": auth_header,
        "Content-Type": "application/json",
    }

    identity_url = (
        settings.identity_service_url.rstrip("/")
        + "/api/v1/users/bulk-import"
    )
    async with httpx.AsyncClient(timeout=settings.httpx_timeout_seconds) as client:
        try:
            resp = await client.post(
                identity_url,
                headers=fwd_headers,
                json={"items": bulk_items, "tenant_id": cfg.tenant_id},
            )
            if resp.status_code >= 400:
                logger.warning(
                    "identity.bulk_import_failed",
                    status=resp.status_code,
                    body=resp.text[:300],
                )
                raise ProblemException(
                    502,
                    "UPSTREAM_FAILED",
                    "Bulk-import failed",
                    f"identity returned {resp.status_code}: {resp.text[:240]}",
                )
            identity_result = resp.json()
        except httpx.HTTPError as exc:
            raise ProblemException(
                502, "UPSTREAM_FAILED", "Identity unreachable", str(exc)
            ) from exc

        # Only enrol REAL users. Email-less participants now come back as
        # external refs (user_id "yc:<login>", action "external") — they
        # are NOT accounts and must not become phantom course members; they
        # join for real when they redeem a binding invitation code.
        members = [
            {"user_id": it["user_id"], "role": "student"}
            for it in identity_result.get("items", [])
            if it.get("user_id")
            and it.get("action") != "external"
            and not str(it["user_id"]).startswith("yc:")
        ]
        enrolled: dict[str, Any] = {"added": 0, "existing": 0, "failed": 0}
        if cfg.course_id and members:
            course_url = (
                settings.course_service_url.rstrip("/")
                + f"/api/v1/courses/{cfg.course_id}/members:batchCreate"
            )
            try:
                resp2 = await client.post(
                    course_url,
                    headers=fwd_headers,
                    json={"members": members},
                )
                if resp2.status_code >= 400:
                    logger.warning(
                        "course.batch_create_failed",
                        status=resp2.status_code,
                        body=resp2.text[:300],
                    )
                    enrolled = {
                        "added": 0,
                        "existing": 0,
                        "failed": len(members),
                        "error": resp2.text[:240],
                    }
                else:
                    rows = resp2.json()
                    rows_list = rows if isinstance(rows, list) else rows.get("data", [])
                    enrolled = {"added": len(rows_list), "existing": 0, "failed": 0}
            except httpx.HTTPError as exc:
                enrolled = {"added": 0, "existing": 0, "failed": len(members), "error": str(exc)}

    return {
        "data": [asdict(rp) for rp in result.participants],
        "imported": result.imported,
        "failed": result.failed,
        "errors": result.errors,
        "course_id": cfg.course_id,
        "identity": {
            "created": identity_result.get("created", 0),
            "existing": identity_result.get("existing", 0),
        },
        "course": enrolled,
    }


@router.post("/{config_id}/contests/{contest_id}/import-submissions")
async def import_submissions(
    config_id: str,
    contest_id: int,
    request: Request,
    assignment_id: str | None = None,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Pull submissions from one Yandex.Contest contest and ingest them
    end-to-end:

      1. ``adapter.import_submissions`` — pulls from Y.C. via OAuth, fetches
         source for each run (one extra GET per submission).
      2. ``identity /users/bulk-import`` — dedupe-creates users by
         ``external_id`` (Yandex uid) so we can attribute each submission.
      3. ``submission /assignments/{aid}/submissions:batchImport`` — ships
         the resolved (login, code, language, submitted_at) tuples into the
         submission-service, which runs dedup, version, late-detection, and
         emits ``submission.created`` events that plagiarism + ai-analysis
         listen on.

    ``assignment_id`` selects the target. Pass it as a query param, OR set
    ``cfg.settings.assignment_id_by_contest[contest_id]`` so the integration
    remembers the mapping for repeat pulls.
    """
    cfg = await _get_cfg(config_id, p, session)

    # Resolve assignment target — query param wins, else config mapping.
    target_assignment = assignment_id
    if target_assignment is None and isinstance(cfg.settings, dict):
        mapping = (cfg.settings.get("assignment_id_by_contest") or {})
        target_assignment = mapping.get(str(contest_id)) or mapping.get(contest_id)
    if not target_assignment:
        raise ProblemException(
            400,
            "ASSIGNMENT_REQUIRED",
            "assignment_id required",
            (
                "Pass ?assignment_id=… or set "
                "cfg.settings.assignment_id_by_contest[contest_id]"
            ),
        )

    adapter = YandexContestAdapter()
    cursor = (cfg.cursor or {}).get(f"yc:{contest_id}:submissions") or {}
    result = await adapter.import_submissions(
        cfg, {"contest_id": contest_id, "cursor": cursor}, since=None
    )

    if result.failed and not result.submissions:
        return {
            "fetched": 0,
            "ingested": 0,
            "deduplicated": 0,
            "failed": result.failed,
            "errors": result.errors,
            "cursor": result.cursor,
        }

    # Persist cursor advance so subsequent pulls are incremental.
    if result.cursor and not result.failed:
        new_cursor = dict(cfg.cursor or {})
        new_cursor[f"yc:{contest_id}:submissions"] = result.cursor
        cfg.cursor = new_cursor
        await session.commit()

    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise ProblemException(
            401, "UNAUTHENTICATED", "Unauthorized", "Bearer token required"
        )

    s = get_settings()
    fwd = {"Authorization": auth_header, "Content-Type": "application/json"}

    # Step 1: bulk-import users so we have author_id per Y.C. login.
    bulk_items = []
    seen_external: set[str] = set()
    for rs in result.submissions:
        if not rs.external_user_id:
            continue
        if rs.external_user_id in seen_external:
            continue
        seen_external.add(rs.external_user_id)
        bulk_items.append(
            {
                "external_id": rs.external_user_id,
                "login": rs.login,
                "email": None,
                "display_name": rs.login or rs.external_user_id,
                "global_role": "student",
            }
        )

    login_to_user_id: dict[str, str] = {}
    external_to_user_id: dict[str, str] = {}
    if bulk_items:
        identity_url = (
            s.identity_service_url.rstrip("/")
            + "/api/v1/users/bulk-import"
        )
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
            ir = await client.post(
                identity_url,
                headers=fwd,
                json={"items": bulk_items, "tenant_id": cfg.tenant_id},
            )
            if ir.status_code >= 400:
                logger.warning(
                    "identity.bulk_import_failed",
                    status=ir.status_code,
                    body=ir.text[:300],
                )
                raise ProblemException(
                    502,
                    "UPSTREAM_FAILED",
                    "Bulk-import failed",
                    f"identity returned {ir.status_code}: {ir.text[:240]}",
                )
            for it in ir.json().get("items", []):
                uid = it.get("user_id")
                if not uid:
                    continue
                ext = it.get("external_id")
                if ext:
                    external_to_user_id[str(ext)] = uid
                # bulk-import returns the requested login in the echoed item
                login = it.get("login")
                if login:
                    login_to_user_id[str(login)] = uid

    # Step 2: build submission batchImport payload, dropping ones we couldn't
    # attribute or whose source we failed to fetch.
    sub_items: list[dict[str, Any]] = []
    unresolved_login = 0
    no_source = 0
    for rs in result.submissions:
        author_id = (
            (rs.external_user_id and external_to_user_id.get(rs.external_user_id))
            or (rs.login and login_to_user_id.get(rs.login))
        )
        if not author_id:
            unresolved_login += 1
            continue
        if not rs.source_code:
            no_source += 1
            continue
        sub_items.append(
            {
                "author_id": author_id,
                "author_login": rs.login,
                "language": rs.language,
                "files": [
                    {
                        "path": rs.filename or f"submission-{rs.external_id}.txt",
                        "content": rs.source_code,
                        "mime_type": "text/plain",
                    }
                ],
                "submitted_at": (
                    rs.submitted_at.isoformat() if rs.submitted_at else None
                ),
                "external_id": rs.external_id,
                "external_url": None,
                "external_verdict": rs.verdict,
                "external_score": rs.score,
            }
        )

    if not sub_items:
        return {
            "fetched": len(result.submissions),
            "ingested": 0,
            "deduplicated": 0,
            "failed": result.failed + unresolved_login + no_source,
            "errors": result.errors
            + ([f"unresolved login ×{unresolved_login}"] if unresolved_login else [])
            + ([f"missing source ×{no_source}"] if no_source else []),
            "cursor": result.cursor,
        }

    submission_url = (
        s.submission_service_url.rstrip("/")
        + f"/api/v1/assignments/{target_assignment}/submissions:batchImport"
    )
    async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
        sr = await client.post(
            submission_url,
            headers=fwd,
            json={
                "course_id": cfg.course_id,
                "source": "yandex_contest",
                "items": sub_items,
            },
        )
        if sr.status_code >= 400:
            logger.warning(
                "submission.batch_import_failed",
                status=sr.status_code,
                body=sr.text[:300],
            )
            raise ProblemException(
                502,
                "UPSTREAM_FAILED",
                "batchImport failed",
                f"submission returned {sr.status_code}: {sr.text[:240]}",
            )
        sub_resp = sr.json()

    return {
        "fetched": len(result.submissions),
        "ingested": sub_resp.get("created", 0),
        "deduplicated": sub_resp.get("deduplicated", 0),
        "failed": (
            result.failed
            + unresolved_login
            + no_source
            + sub_resp.get("failed", 0)
        ),
        "errors": result.errors
        + ([f"unresolved login ×{unresolved_login}"] if unresolved_login else [])
        + ([f"missing source ×{no_source}"] if no_source else []),
        "cursor": result.cursor,
        "operation_id": sub_resp.get("operation_id"),
        "assignment_id": target_assignment,
    }


@router.post("/{config_id}/sync-contest-structure")
async def sync_contest_structure(
    config_id: str,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Pull problems for the contest bound in `cfg.settings.contest_id`."""
    cfg = await _get_cfg(config_id, p, session)
    contest_id = (
        (cfg.settings or {}).get("contest_id") if isinstance(cfg.settings, dict) else None
    )
    if contest_id is None:
        return {"ok": False, "structure": [], "detail": "no contest_id in settings"}
    # Re-use list_remote_courses as a touchpoint; problems are exposed via the
    # passthrough route above. Full sync into course-service is a follow-up.
    adapter = YandexContestAdapter()
    courses = await adapter.list_remote_courses(cfg)
    target = next((c for c in courses if str(c.external_id) == str(contest_id)), None)
    return {"ok": True, "contest_id": contest_id, "found": target is not None}


@router.post("/{config_id}/migrate-author-ids")
async def migrate_author_ids(
    config_id: str,
    contest_id: int,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """One-shot migration: replace unstable per-contest participantIds with
    stable yandex logins on existing submissions + external_bindings.

    Background — before commit 4871fdf, the yc-import-as-homework path built
    ``author_id = "yc:<participantId>"`` using the numeric id Y.Contest puts
    on each submission row. That id is contest-scoped — a re-import of the
    same student into another contest produces a different participantId,
    so the same human ends up as two unrelated «authors» and breaks
    cross-contest user attribution / binding.

    This endpoint hits ``/v2/contests/{contest_id}/participants`` (which DOES
    return the stable yandex login), builds a ``participantId → login`` map,
    and rewrites every ``yc:<pid>``-prefixed row inside ``tenant_id`` so it
    now reads ``yc:<login>``.

    The rewrites are NOT done with cross-schema SQL: integration owns no rows
    in submission's or identity's tables. Instead it orchestrates over HTTP —
    identity's ``POST /external-bindings:migrate-yc`` swaps the binding keys
    (its own table) and returns the tenant's yc bindings; submission's
    ``POST /submissions:migrate-external-authors`` renames + claims the
    submission rows (its own table). Both are admin-gated and called with a
    service token.

    Admin-only. Idempotent — already-migrated rows (``yc:<login>``) don't
    match the pattern and are left alone.
    """
    if not p.is_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "Admin role required")

    cfg = await _get_cfg(config_id, p, session)
    adapter = YandexContestAdapter()
    pres = await adapter.import_participants(cfg, {"contest_id": contest_id})
    pid_to_login: dict[str, str] = {}
    for rp in pres.participants:
        if rp.participant_id and rp.login:
            pid_to_login[str(rp.participant_id)] = str(rp.login)
    if not pid_to_login:
        return {
            "ok": True,
            "contest_id": contest_id,
            "mapped": 0,
            "submissions_updated": 0,
            "bindings_updated": 0,
            "detail": "no participants with a login surfaced for this contest",
        }

    # Each write goes through the OWNING service's admin HTTP API — integration
    # never touches submission's or identity's schema directly. We authenticate
    # with the cached admin service token (NOT a forged JWT) via the
    # shared ServiceClient (retry + circuit-breaker + X-Request-Id). The remap
    # key shapes differ only by field name: identity wants
    # ``{from_external_id, to_external_id}``, submission wants ``{from, to}``.
    identity_remaps = [
        {"from_external_id": f"yc:{pid}", "to_external_id": f"yc:{login}"}
        for pid, login in pid_to_login.items()
    ]
    submission_remaps = [
        {"from": f"yc:{pid}", "to": f"yc:{login}"}
        for pid, login in pid_to_login.items()
    ]

    settings = get_settings()

    # 1) identity — rename the bindings (its own external_bindings table) and
    #    hand back every yc binding in this tenant for the claim pass below.
    #    identity reads the target tenant from the body + admin bypasses its
    #    tenant check, so the default (system) service token is fine here.
    identity_headers = {
        **(await service_auth_headers()),
        "Content-Type": "application/json",
    }
    identity_base = settings.identity_service_url.rstrip("/")
    identity_sc = ServiceClient(
        identity_base,
        provider="identity",
        timeout=settings.httpx_timeout_seconds,
    )
    try:
        iresp = await identity_sc.post(
            identity_base + "/api/v1/external-bindings:migrate-yc",
            headers=identity_headers,
            json={"tenant_id": cfg.tenant_id, "remaps": identity_remaps},
        )
        identity_body = iresp.json()
    finally:
        await identity_sc.aclose()

    bindings_updated = int(identity_body.get("bindings_updated", 0))
    claims = [
        {"external_id": b["external_id"], "user_id": b["user_id"]}
        for b in identity_body.get("bindings", [])
        if b.get("external_id") and b.get("user_id")
    ]

    # 2) submission — rename author_ids on its own submissions table, then
    #    reattribute the bound rows. submission scopes both passes by the
    #    *token's* tenant (never the body), so we mint a token carrying
    #    cfg.tenant_id — exactly the tenant the old raw UPDATE scoped to.
    submission_headers = {
        **(await service_auth_headers_for_tenant(cfg.tenant_id)),
        "Content-Type": "application/json",
    }
    submission_base = settings.submission_service_url.rstrip("/")
    submission_sc = ServiceClient(
        submission_base,
        provider="submission",
        timeout=settings.httpx_timeout_seconds,
    )
    try:
        sresp = await submission_sc.post(
            submission_base + "/api/v1/submissions:migrate-external-authors",
            headers=submission_headers,
            json={"remaps": submission_remaps, "claims": claims},
        )
        submission_body = sresp.json()
    finally:
        await submission_sc.aclose()

    subs_total = int(submission_body.get("submissions_updated", 0))
    claimed = int(submission_body.get("claimed", 0))

    logger.info(
        "yc.migrate_author_ids.done",
        contest_id=contest_id,
        tenant_id=cfg.tenant_id,
        mapped=len(pid_to_login),
        submissions_updated=subs_total,
        bindings_updated=bindings_updated,
        claimed=claimed,
    )
    return {
        "ok": True,
        "contest_id": contest_id,
        "mapped": len(pid_to_login),
        "submissions_updated": subs_total,
        "bindings_updated": bindings_updated,
        "claimed": claimed,
    }
