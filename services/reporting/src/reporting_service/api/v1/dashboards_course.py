"""Course dashboards (§E)."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request
from plaglens_common.errors import PlagLensError
from plaglens_common.service_client import ServiceClient
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.cache import JsonCache
from ...common.deps import get_session
from ...common.problem import forbidden
from ...common.rbac import Principal, get_principal
from ...dashboards.service import DashboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/courses/{course_id}/dashboard", tags=["dashboards-course"])


def _dashboard_client(base_url: str, provider: str) -> ServiceClient:
    """A ServiceClient tuned for the live-dashboard fan-out: the same tight
    4s budget the old ``httpx.AsyncClient(timeout=4.0)`` used, and
    ``max_retries=0`` so a slow upstream can't multiply that budget — these
    endpoints would rather show cached zeros than hang the page."""
    return ServiceClient(
        base_url, provider=provider, timeout=4.0, max_retries=0
    )


async def _get_json(
    client: ServiceClient,
    path: str,
    headers: dict[str, str],
    *,
    params: Any = None,
) -> Any | None:
    """GET ``path`` and return the parsed JSON body, or ``None`` on any
    transport error / non-2xx. Lets the fan-out below skip a failed
    assignment (the old ``if resp.status_code >= 400: continue``) without
    one bad request cancelling its siblings inside ``asyncio.gather``."""
    try:
        resp = await client.get(path, headers=headers, params=params)
    except PlagLensError:
        return None
    return resp.json()


async def _live_overview_fallback(
    request: Request,
    bearer: str | None,
    course_id: str,
) -> dict | None:
    """Compute the four headline KPIs straight off the course /
    submission services when the local read-model is empty.

    Background: the reporting service depends on Kafka events
    (``course.created`` / ``submission.created`` / …) to populate its
    ``course_stats`` read-model. In the dev cluster those producers
    were misconfigured for a long time, so existing courses have **no
    events** — every dashboard request comes back with literal zeros
    even though the underlying data is right there in the course/
    submission databases. Rather than blocking on a full event
    backfill, fall back to a synchronous fan-out to the upstream
    HTTP APIs so the screen shows real numbers immediately. Returns
    ``None`` (caller keeps the zeros) if anything goes wrong.
    """
    settings = request.app.state.settings
    if not bearer:
        return None
    headers = {"Authorization": bearer}
    course_url = settings.course_service_base_url.rstrip("/")
    sub_url = settings.submission_service_base_url.rstrip("/")
    try:
        async with (
            _dashboard_client(course_url, "course") as course_client,
            _dashboard_client(sub_url, "submission") as sub_client,
        ):
            course_payload, asg_payload = await _gather(
                _get_json(course_client, f"/api/v1/courses/{course_id}", headers),
                _get_json(
                    course_client,
                    f"/api/v1/courses/{course_id}/assignments",
                    headers,
                    params={"limit": 500},
                ),
            )
            if course_payload is None or asg_payload is None:
                return None
            assignments = asg_payload.get("data") or []
            # `members_count` on the course payload counts ALL roles
            # (incl. owners/co-owners/assistants), so we'll override
            # below with a distinct-author count from submissions —
            # closer to "how many students actually participated".
            members_count = int(course_payload.get("members_count") or 0)
            assignments_count = len(assignments)
            # Submissions / average score require per-assignment fan-out
            # against the submission service. Keep it bounded — first 50
            # assignments only, that's already plenty for any real-world
            # ДЗ list and protects us from N+1 explosion.
            submissions_total = 0
            distinct_authors: set[str] = set()
            last_activity_iso: str | None = None
            asg_ids = [
                str(a.get("id"))
                for a in assignments[:50]
                if a.get("id") is not None
            ]
            if asg_ids:
                # Two parallel fan-outs:
                #   1. submissions per assignment → totals, authors,
                #      last_activity (NB: external_score is null in
                #      practice — submission rows can't tell us the
                #      grade).
                #   2. grades per assignment → real scores from the
                #      submission_grades table (this is where the
                #      teacher-assigned scores actually live).
                sub_tasks = [
                    _get_json(
                        sub_client,
                        f"/api/v1/assignments/{aid}/submissions",
                        headers,
                        params={"limit": 200},
                    )
                    for aid in asg_ids
                ]
                grade_tasks = [
                    _get_json(
                        sub_client,
                        f"/api/v1/assignments/{aid}/grades",
                        headers,
                    )
                    for aid in asg_ids
                ]
                sub_payloads, grade_payloads = await _gather(
                    _gather(*sub_tasks),
                    _gather(*grade_tasks),
                )
                for sr in sub_payloads:
                    if sr is None:
                        continue
                    rows = (sr or {}).get("data") or []
                    submissions_total += len(rows)
                    for row in rows:
                        author_id = row.get("author_id")
                        if isinstance(author_id, str) and author_id:
                            distinct_authors.add(author_id)
                        ts = row.get("submitted_at") or row.get("created_at")
                        if isinstance(ts, str):
                            if last_activity_iso is None or ts > last_activity_iso:
                                last_activity_iso = ts
                scores: list[float] = []
                for gr in grade_payloads:
                    if gr is None:
                        continue
                    grade_rows = gr or []
                    # The grades endpoint returns a bare list, not a
                    # paginated envelope.
                    if isinstance(grade_rows, dict):
                        grade_rows = grade_rows.get("data") or []
                    for g in grade_rows:
                        s = g.get("score") if isinstance(g, dict) else None
                        if isinstance(s, (int, float)):
                            scores.append(float(s))
                avg_score = round(sum(scores) / len(scores), 2) if scores else None
            else:
                avg_score = None
            # Prefer the distinct-author count when we have one; fall
            # back to the raw members_count from the course service so
            # an empty submissions list doesn't read as "0 студентов".
            enrolled = len(distinct_authors) or members_count
            return {
                "course_id": course_id,
                "enrolled_students": enrolled,
                "assignments_count": assignments_count,
                "submissions_total": submissions_total,
                "average_score": avg_score,
                "plagiarism_alerts_count": 0,
                "ai_runs_count": 0,
                "ai_tokens_used": 0,
                "last_activity_at": last_activity_iso,
                "cached": False,
            }
    except ValueError as exc:  # pragma: no cover - network
        # Transport / non-2xx no longer surface here — ``_get_json`` swallows
        # them to ``None`` so one slow assignment can't sink the whole fan-out.
        # A malformed-but-2xx JSON body still raises ``ValueError`` → zeros.
        logger.warning("live overview fallback failed: %s", exc)
        return None


async def _gather(*coros):
    """Tiny ``asyncio.gather`` shim — keeps the call site terse and lets
    the test harness monkey-patch it if it ever needs to."""
    import asyncio

    return await asyncio.gather(*coros)


def _check_member(p: Principal, course_id: str) -> None:
    if p.has_global("admin",):
        return
    if p.course_role(course_id) is not None:
        return
    # The identity service issues JWTs without ``course_roles`` populated —
    # so a teacher who owns this course has nothing to match. Trust the
    # global role: any teacher passes; the downstream queries are
    # tenant-scoped via ``p.tenant_id`` so cross-tenant leakage is
    # still prevented. Mirrors the same fallback in exports / scheduled
    # / google_sheets routers.
    if p.has_global("teacher"):
        return
    raise forbidden("Not a course member")


def _check_teacher(p: Principal, course_id: str) -> None:
    if p.has_global("admin",):
        return
    if p.has_course_role(course_id, "owner", "co_owner", "assistant"):
        return
    if p.has_global("teacher"):
        return
    raise forbidden("Need teacher/assistant")


def _check_owner(p: Principal, course_id: str) -> None:
    if p.has_global("admin",):
        return
    if p.has_course_role(course_id, "owner", "co_owner"):
        return
    if p.has_global("teacher"):
        return
    raise forbidden("Need owner/co_owner")


def _service(request: Request, session: AsyncSession) -> DashboardService:
    cache = JsonCache(request.app.state.redis, prefix=f"{request.app.state.settings.redis_prefix}:dash")
    return DashboardService(
        session,
        cache,
        overview_ttl=request.app.state.settings.cache_overview_ttl_seconds,
        detail_ttl=request.app.state.settings.cache_detail_ttl_seconds,
    )


@router.get("")
async def overview(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_member(p, course_id)
    data = await _service(request, session).course_overview(p.tenant_id, course_id)
    # Empty read-model → fall back to live HTTP fan-out so the user
    # sees real numbers instead of all-zeros. The read-model takes over
    # again as soon as events start flowing.
    if (
        not data.get("assignments_count")
        and not data.get("submissions_total")
        and not data.get("enrolled_students")
    ):
        bearer = request.headers.get("authorization")
        live = await _live_overview_fallback(request, bearer, course_id)
        if live is not None:
            return live
    return data


@router.get("/grades-distribution")
async def grades_distribution(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    data = await _service(request, session).course_grades_distribution(
        p.tenant_id, course_id
    )
    buckets = data.get("buckets") or []
    # The read-model also returns zero-count buckets when there are no
    # graded submissions. Detect that and run the same live fan-out as
    # the overview endpoint to produce real histogram counts. Also map
    # the field name `range` → `bucket` so the frontend chart's
    # `<XAxis dataKey="bucket" />` picks up the labels.
    has_any_counts = any((b.get("count") or 0) > 0 for b in buckets)
    if not has_any_counts:
        bearer = request.headers.get("authorization")
        live = await _live_grades_distribution(request, bearer, course_id)
        if live is not None:
            return live
    # Read-model already had data; normalise the field shape for the
    # frontend (it expects `bucket`, `count`, `mean`, `median`).
    return {
        "course_id": course_id,
        "buckets": [
            {
                "bucket": b.get("range") or b.get("bucket") or "",
                "count": int(b.get("count") or 0),
            }
            for b in buckets
        ],
        "mean": data.get("mean"),
        "median": data.get("median"),
    }


async def _live_grades_distribution(
    request: Request,
    bearer: str | None,
    course_id: str,
) -> dict | None:
    """Compute a real grade histogram off the submission service when
    the read-model has nothing useful. Pulls from
    `/assignments/{id}/grades` (the actual `submission_grades` table)
    rather than the submission rows themselves — `external_score`
    isn't filled in for manually-graded assignments. Buckets auto-scale
    to the data: if the highest observed score is ≤ 10, we assume a
    0-10 academic scale; otherwise we treat it as 0-100."""
    settings = request.app.state.settings
    if not bearer:
        return None
    headers = {"Authorization": bearer}
    course_url = settings.course_service_base_url.rstrip("/")
    sub_url = settings.submission_service_base_url.rstrip("/")
    try:
        async with (
            _dashboard_client(course_url, "course") as course_client,
            _dashboard_client(sub_url, "submission") as sub_client,
        ):
            asg_payload = await _get_json(
                course_client,
                f"/api/v1/courses/{course_id}/assignments",
                headers,
                params={"limit": 500},
            )
            if asg_payload is None:
                return None
            assignments = (asg_payload or {}).get("data") or []
            if not assignments:
                return None
            grade_tasks = [
                _get_json(
                    sub_client,
                    f"/api/v1/assignments/{a.get('id')}/grades",
                    headers,
                )
                for a in assignments[:50]
                if a.get("id") is not None
            ]
            grade_payloads = await _gather(*grade_tasks)
            scores: list[float] = []
            for gr in grade_payloads:
                if gr is None:
                    continue
                rows = gr or []
                if isinstance(rows, dict):
                    rows = rows.get("data") or []
                for row in rows:
                    s = row.get("score") if isinstance(row, dict) else None
                    if isinstance(s, (int, float)):
                        scores.append(float(s))
            if not scores:
                return None
            # Auto-scale buckets. Most courses grade on a 0-10 scale
            # (HSE / russian academic convention), some use 0-100 (YC
            # percentages). Detect by the observed max.
            max_score = max(scores)
            if max_score <= 10.5:
                cuts = [4.0, 6.0, 8.0]
                labels = ["0–4", "4–6", "6–8", "8–10"]
            else:
                cuts = [49.0, 69.0, 84.0]
                labels = ["0–49", "50–69", "70–84", "85–100"]
            buckets = [{"bucket": label, "count": 0} for label in labels]
            for s in scores:
                if s < cuts[0]:
                    buckets[0]["count"] += 1
                elif s < cuts[1]:
                    buckets[1]["count"] += 1
                elif s < cuts[2]:
                    buckets[2]["count"] += 1
                else:
                    buckets[3]["count"] += 1
            mean = round(sum(scores) / len(scores), 2)
            srt = sorted(scores)
            mid = len(srt) // 2
            median = (
                float(srt[mid])
                if len(srt) % 2 == 1
                else (srt[mid - 1] + srt[mid]) / 2
            )
            return {
                "course_id": course_id,
                "buckets": buckets,
                "mean": mean,
                "median": round(float(median), 2),
            }
    except ValueError as exc:  # pragma: no cover - network
        # Transport / non-2xx are swallowed to ``None`` inside ``_get_json``;
        # only a malformed 2xx JSON body reaches here.
        logger.warning("live grades-dist fallback failed: %s", exc)
        return None


@router.get("/grades-by-assignment")
async def grades_by_assignment(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_grades_by_assignment(p.tenant_id, course_id)


@router.get("/plagiarism-stats")
async def plagiarism_stats(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_plagiarism_stats(p.tenant_id, course_id)


@router.get("/ai-usage")
async def ai_usage(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_owner(p, course_id)
    return await _service(request, session).course_ai_usage(p.tenant_id, course_id)


@router.get("/timeline")
async def timeline(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_timeline(p.tenant_id, course_id)


@router.get("/active-students")
async def active_students(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_active_students(p.tenant_id, course_id)


@router.get("/stragglers")
async def stragglers(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_stragglers(p.tenant_id, course_id)


@router.get("/late-submissions")
async def late_submissions(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_late_submissions(p.tenant_id, course_id)


@router.get("/language-breakdown")
async def language_breakdown(
    course_id: str,
    request: Request,
    p: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    _check_teacher(p, course_id)
    return await _service(request, session).course_language_breakdown(p.tenant_id, course_id)
