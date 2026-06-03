"""Student self-service endpoints (section F of 06-SUBMISSION.md)."""
from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Query
from plaglens_common.service_client import ServiceClient
from plaglens_common.service_token import mint_service_jwt
from sqlalchemy import text

from submission_service.api.deps import CourseDep, CurrentUser, SessionDep
from submission_service.common.pagination import Page, PageInfo
from submission_service.common.problem import forbidden, not_found
from submission_service.config import get_settings
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.schemas.feedback import FeedbackOut
from submission_service.schemas.grading import GradeOut
from submission_service.schemas.submission import SubmissionOut
from submission_service.services.course_client import CourseClient

router = APIRouter()


async def _self_author_ids(session: Any, user_id: str) -> list[str]:
    """The set of ``author_id`` values that count as "this user's submissions".

    A submission row's ``author_id`` is either:
      * the user's own ``usr_…`` id (post-claim or direct upload), OR
      * an external participant id like ``yc:smmaxims`` (pre-claim,
        imported from Yandex.Contest / Stepik / eJudge).

    To make `/users/me/submissions` show BOTH kinds without forcing a
    "claim" step on every import, we expand the filter to include every
    external_id the user has linked. Identity is in the same Postgres but
    a different schema — a single cross-schema ``IN`` query covers it.
    Falls back to just ``[user_id]`` if the query trips on a missing
    grant; the worst case is then the old behaviour (only user_id rows
    show up).
    """
    ids: list[str] = [user_id]
    try:
        rows = (
            await session.execute(
                text(
                    "SELECT system || ':' || external_id AS ext "
                    "FROM identity.external_bindings "
                    "WHERE user_id = :uid"
                ),
                {"uid": user_id},
            )
        ).all()
        for (ext,) in rows:
            if ext and ext not in ids:
                ids.append(str(ext))
    except Exception:
        # Permission denied or schema missing in dev/test envs — keep
        # going with the bare user_id, the old behaviour. We don't want
        # the whole /users/me/submissions page to 500 over a grant.
        pass
    return ids


def _ensure_self(sub: Any, author_ids: list[str]) -> None:
    if sub.author_id not in author_ids:
        raise forbidden("Not your submission")


@router.get(
    "/users/me/assignments/{assignment_id}/submissions",
    response_model=list[SubmissionOut],
)
async def my_submissions_for_assignment(
    assignment_id: str, user: CurrentUser, session: SessionDep
) -> list[SubmissionOut]:
    repo = SubmissionRepository(session)
    author_ids = await _self_author_ids(session, user.user_id)
    items = await repo.list_for_user(
        author_id=author_ids,
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
    course: CourseDep,
    course_id: str | None = None,
    assignment_id: str | None = None,
    assignment_ids: list[str] | None = Query(default=None),
    language: str | None = None,
    assigned_grader_id: str | None = None,
    review_status: str | None = Query(
        default=None,
        description="Staff triage bucket: 'flagged' (manually flagged) | "
        "'pending' (no grade yet) | 'graded' (score set).",
    ),
    latest_per_student: bool = Query(default=False),
    q: str | None = Query(
        default=None,
        description="Free-text search across author, ДЗ/задание title, "
        "verdict, status and language (staff inbox + global search).",
    ),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=10_000),
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
        # A global admin spans ALL tenants whenever the query is *scoped* —
        # a search (q) or a specific course / assignment. This makes the
        # per-assignment "Посылки" tab and per-course inbox show cross-tenant
        # work (e.g. admin opening a course that lives in another tenant).
        # The bare, unscoped admin inbox stays tenant-local so it isn't
        # flooded with every submission on the platform.
        admin_scoped = bool(q or course_id or assignment_id or assignment_ids)
        inbox_tenant = (
            None
            if (user.global_role == "admin" and admin_scoped)
            else user.tenant_id
        )
        all_items = await repo.list_inbox_for_staff(
            tenant_id=inbox_tenant,
            course_id=course_id,
            assignment_id=assignment_id,
            assignment_ids=assignment_ids,
            language=language,
            assigned_grader_id=assigned_grader_id,
            latest_per_student=latest_per_student,
            limit=10_000,
        )
        # Assistants are course-scoped staff (unlike teachers/admins who
        # see the whole tenant): restrict the inbox to the courses they
        # actually belong to, so they never see other courses' work.
        if user.global_role == "assistant":
            allowed = await course.staff_course_ids(user.user_id)
            all_items = [s for s in all_items if s.course_id in allowed]
    else:
        author_ids = await _self_author_ids(session, user.user_id)
        all_items = await repo.list_for_user(
            author_id=author_ids,
            tenant_id=user.tenant_id,
            course_id=course_id,
            assignment_id=assignment_id,
            language=language,
            limit=10_000,
        )
    # Review-status bucket (staff triage). Applied here (not in SQL) so
    # the count + pagination reflect the filter — the JSON ``flags`` and
    # the one-to-one ``grade`` relationship are awkward to filter in the
    # shared query, and the working set is already bounded. Definitions:
    #   • flagged — teacher set the manual flag in the review UI
    #   • graded  — a grade row exists with a score
    #   • pending — everything else (not yet graded)
    if review_status in ("flagged", "pending", "graded"):

        def _is_graded(s: Any) -> bool:
            g = getattr(s, "grade", None)
            return g is not None and g.score is not None

        if review_status == "flagged":
            all_items = [
                s for s in all_items if bool((s.flags or {}).get("manually_flagged"))
            ]
        elif review_status == "graded":
            all_items = [s for s in all_items if _is_graded(s)]
        else:  # pending
            all_items = [s for s in all_items if not _is_graded(s)]

    # Free-text search (cross-submission). Matches author label, verdict,
    # status, language directly; ДЗ/задание titles are matched by resolving
    # the assignment ids whose title contains ``q`` (one course-schema
    # query) and keeping submissions that point at them. Applied to the
    # already-scoped working set, so it respects course visibility.
    if q and q.strip():
        ql = q.strip().lower()
        # ДЗ/задание titles are matched by resolving the assignment ids whose
        # title (or parent homework title) contains the query — ICU-folded so
        # Cyrillic matches under LC_CTYPE=C. Behind the CourseClient seam now;
        # still best-effort (returns an empty set on failure).
        match_asg: set[str] = await course.search_assignment_ids_by_title(q)

        def _q_match(s: Any) -> bool:
            if (s.author_label or "").lower().find(ql) >= 0:
                return True
            # Also match the author key (e.g. Yandex.Contest login/cohort
            # "yc:hse-compds-2024-12") so searching a login/cohort surfaces
            # all of that author's work, not only rows whose label is the login.
            if (s.author_id or "").lower().find(ql) >= 0:
                return True
            if s.assignment_id in match_asg:
                return True
            for f in (s.external_verdict, s.status, s.language):
                if f and ql in str(f).lower():
                    return True
            return False

        all_items = [s for s in all_items if _q_match(s)]

    total = len(all_items)
    window = all_items[offset : offset + limit]
    info = PageInfo(
        next_cursor=None,
        has_more=offset + limit < total,
        limit=limit,
        offset=offset,
        total=total,
    )
    out = [SubmissionOut.model_validate(s) for s in window]
    # Mark graded rows from the eager-loaded grade relationship and
    # surface the score where the viewer is allowed to see it.
    #
    # Staff (teacher/admin/assistant) always see the score — that's
    # their triage queue.
    #
    # Students see their OWN graded submissions with score whenever the
    # grade row is flagged ``comment_visible_to_student=True`` (the
    # teacher's "release" toggle). Previously the score was stripped
    # unconditionally on the student list, which made the dashboard's
    # «Мои посылки» say «на проверке» for every released grade — the
    # release-schedule gate in ``my_grade`` only covers the per-row
    # detail page. The same flag is the source of truth here too.
    is_staff = user.global_role in _STAFF_ROLES
    for model, src in zip(out, window, strict=True):
        g = getattr(src, "grade", None)
        graded = g is not None and g.score is not None
        model.is_graded = graded
        if not graded:
            continue
        visible = is_staff or bool(getattr(g, "comment_visible_to_student", False))
        if visible:
            model.score = float(g.score)
            model.max_score = (
                float(g.max_score) if g.max_score is not None else None
            )
    # Denormalise course / homework / assignment titles for the window
    # so the list labels every row even when no course is selected (one
    # batch query, not per-row N+1). Applies to students too — it's
    # their own submissions' assignment titles, nothing sensitive.
    if out:
        await _enrich_titles(course, out)
        # Resolve usr_ → display name (e.g. "Nikita Shamov") so the staff
        # inbox and cross-submission search never show a raw id. The
        # per-assignment list endpoints in submissions.py already do this;
        # the inbox went through this endpoint and was missed.
        await _enrich_authors(out, user.tenant_id)
    return Page[SubmissionOut](data=out, pagination=info)


async def _enrich_titles(course: CourseClient, rows: list[SubmissionOut]) -> None:
    """Fill ``assignment_title`` / ``homework_title`` / ``course_name`` on
    a page of inbox rows via the CourseClient (one batched read-model call;
    in the merged process it resolves the course tables directly, same DB)."""
    titles = await course.enrich_titles([r.assignment_id for r in rows])
    if not titles:
        return
    for r in rows:
        t = titles.get(r.assignment_id)
        if t is None:
            continue
        r.assignment_title = t.assignment_title
        r.homework_title = t.homework_title
        r.course_name = t.course_name


# --- author display-name enrichment (identity) ----------------------------
# Submissions store only ``author_id`` (usr_…) + an optional ``author_label``
# (set by integrations like Y.Contest). A manually-uploaded submission has no
# label, so the UI would otherwise show the raw ``usr_…`` id everywhere
# (list / detail / breadcrumb). We resolve the real display name from identity
# with a short-lived service JWT, cache it per id, and fill ``author_label``.
# Best-effort: any failure leaves the row untouched (UI falls back to the id).
_NAME_CACHE: dict[str, tuple[str, float]] = {}
_NAME_TTL_S = 300.0


async def _resolve_display_names(ids: list[str], tenant_id: str) -> dict[str, str]:
    now = time.time()
    out: dict[str, str] = {}
    missing: list[str] = []
    for uid in ids:
        cached = _NAME_CACHE.get(uid)
        if cached is not None and cached[1] > now:
            out[uid] = cached[0]
        else:
            missing.append(uid)
    if not missing:
        return out
    token = mint_service_jwt(subject="submission-service", tenant_id=tenant_id)
    if not token:
        return out
    # Deployment provides IDENTITY_BASE_URL (http://identity:8000); the config
    # default IDENTITY_SERVICE_URL is stale (wrong host/port, doesn't resolve).
    base = os.environ.get("IDENTITY_BASE_URL") or get_settings().IDENTITY_SERVICE_URL
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with ServiceClient(
            base_url=base,
            provider="identity",
            timeout=5.0,
            default_headers=headers,
        ) as client:

            async def _one(uid: str) -> tuple[str, str | None]:
                try:
                    r = await client.get(f"/api/v1/people/{uid}")
                    data = r.json() if r.content else None
                    return uid, (data or {}).get("display_name")
                except Exception:
                    return uid, None

            for uid, name in await asyncio.gather(*[_one(u) for u in missing]):
                if name:
                    _NAME_CACHE[uid] = (name, now + _NAME_TTL_S)
                    out[uid] = name
    except Exception:
        return out
    return out


async def _enrich_authors(rows: list[SubmissionOut], tenant_id: str) -> None:
    """Fill ``author_label`` with the author's identity display name for any
    real-user (``usr_…``) submission that lacks a label, so the UI never shows
    a raw id. YC ``yc:…`` ghosts keep their roster label."""
    ids = sorted(
        {
            r.author_id
            for r in rows
            if r.author_id
            and r.author_id.startswith("usr_")
            and not (r.author_label or "").strip()
        }
    )
    if not ids:
        return
    names = await _resolve_display_names(ids, tenant_id)
    if not names:
        return
    for r in rows:
        if (
            r.author_id
            and not (r.author_label or "").strip()
            and r.author_id in names
        ):
            r.author_label = names[r.author_id]


@router.get("/users/me/submissions/{submission_id}", response_model=SubmissionOut)
async def my_submission(
    submission_id: str, user: CurrentUser, session: SessionDep
) -> SubmissionOut:
    repo = SubmissionRepository(session)
    sub = await repo.get(submission_id)
    if sub is None:
        raise not_found("Submission not found")
    _ensure_self(sub, await _self_author_ids(session, user.user_id))
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
    _ensure_self(sub, await _self_author_ids(session, user.user_id))
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
    _ensure_self(sub, await _self_author_ids(session, user.user_id))
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
    _ensure_self(sub, await _self_author_ids(session, user.user_id))
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
    _ensure_self(sub, await _self_author_ids(session, user.user_id))
    items = await repo.list_feedback(sub.id, visible_only=True)
    llm = [f for f in items if f.source == "llm_curated"]
    return {
        "submission_id": sub.id,
        "comments": [
            {"id": f.id, "body": f.body, "created_at": f.created_at} for f in llm
        ],
    }


@router.get("/people/{author_id}/submissions", response_model=Page[SubmissionOut])
async def person_submissions(
    author_id: str,
    user: CurrentUser,
    session: SessionDep,
    course: CourseDep,
    limit: int = Query(default=100, ge=1, le=500),
) -> Page[SubmissionOut]:
    """A person's submissions, gated to what the viewer may see (powers the
    public profile's submissions section). Self / admin → all (within the
    viewer's tenant); teacher / assistant → only submissions in courses the
    viewer manages; anyone else → nothing."""
    repo = SubmissionRepository(session)
    is_self = user.user_id == author_id
    if is_self or user.is_admin:
        rows = await repo.list_for_user(
            author_id=author_id, tenant_id=user.tenant_id, limit=500
        )
    elif user.global_role in _STAFF_ROLES:
        rows = await repo.list_for_user(
            author_id=author_id, tenant_id=user.tenant_id, limit=500
        )
        visible = await course.visible_course_ids(user.user_id)
        rows = [s for s in rows if s.course_id in visible]
    else:
        rows = []

    window = rows[:limit]
    out = [SubmissionOut.model_validate(s) for s in window]
    can_see_score = is_self or user.global_role in _STAFF_ROLES
    for model, src in zip(out, window, strict=True):
        g = getattr(src, "grade", None)
        graded = g is not None and g.score is not None
        model.is_graded = graded
        if graded and (
            can_see_score or bool(getattr(g, "comment_visible_to_student", False))
        ):
            model.score = float(g.score)
            model.max_score = float(g.max_score) if g.max_score is not None else None
    if out:
        await _enrich_titles(course, out)
    return Page[SubmissionOut](
        data=out,
        pagination=PageInfo(
            next_cursor=None,
            has_more=len(rows) > limit,
            limit=limit,
            offset=0,
            total=len(rows),
        ),
    )
