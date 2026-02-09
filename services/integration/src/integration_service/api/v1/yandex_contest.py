"""Yandex.Contest-specific endpoints (§D)."""
from __future__ import annotations

import asyncio
import json
import re
import secrets
import time
import unicodedata
from collections import Counter
from dataclasses import asdict
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.adapters.base import RemoteProblem
from integration_service.adapters.yandex_contest import (
    YandexContestAdapter,
    yc_get,
)
from integration_service.api.v1.configs import ensure_owner_or_admin
from integration_service.common.auth import Principal
from integration_service.common.db import get_sessionmaker
from integration_service.common.problems import ProblemException, not_found
from integration_service.common.redis_client import get_redis
from integration_service.config import get_settings
from integration_service.deps import principal_dep, session_dep
from integration_service.repositories import IntegrationConfigRepo
from integration_service.services.oauth import get_access_token
from integration_service.services.service_token import auth_headers as service_auth_headers

logger = structlog.get_logger(__name__)


def _slugify(value: str, fallback: str) -> str:
    """Generate a course-service-safe slug: ``^[a-z0-9][a-z0-9._-]*$``.

    Transliterates Cyrillic letters loosely (drops non-ASCII characters
    after NFKD), collapses everything else into single dashes, and falls
    back to a provided seed if the result would be empty.
    """
    nfkd = unicodedata.normalize("NFKD", value)
    ascii_value = nfkd.encode("ascii", "ignore").decode("ascii")
    lower = ascii_value.lower().strip()
    slug = re.sub(r"[^a-z0-9._-]+", "-", lower).strip("-._")
    if not slug or not slug[0].isalnum():
        slug = fallback
    return slug[:64]


def _normalize_language_hint(raw: str | None) -> str | None:
    """Map a Yandex.Contest compiler/language string to a canonical
    ``language_hint`` (python / cpp / c / java / …).

    YC reports the *compiler*, not a tidy language name — values look like
    ``python3_13``, ``pypy3_10``, ``gcc``, ``g++17``, ``mono``. We collapse
    each compiler family to one hint. Returns ``None`` for anything we don't
    recognise so callers leave the hint unset rather than guess wrong.
    """
    if not raw:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    # Order matters — check the more specific families before the bare
    # single-letter ``c`` catch so e.g. ``g++`` is never read as C.
    if "pypy" in s or "python" in s or s.startswith("py"):
        return "python"
    if "kotlin" in s:
        return "kotlin"
    if "java" in s:
        return "java"
    if "c++" in s or "g++" in s or "clang++" in s or "cpp" in s or "msvc" in s:
        return "cpp"
    if "c#" in s or "csharp" in s or "mono" in s or "dotnet" in s:
        return "csharp"
    if "javascript" in s or "node" in s or s == "js":
        return "javascript"
    if "typescript" in s or s == "ts":
        return "typescript"
    if "rust" in s:
        return "rust"
    if s == "go" or "golang" in s:
        return "go"
    # Plain C — ``gcc``, ``c11``, ``c17``, bare ``c``. Last so the ``c``
    # substring can't shadow the c++ / c# families above.
    if s == "c" or s.startswith("gcc") or re.fullmatch(r"c\d*", s):
        return "c"
    return None


_OP_TTL_S = 24 * 3600


def _op_key(op_id: str) -> str:
    return f"yc_import_op:{op_id}"


async def _op_create(initial: dict[str, Any]) -> str:
    """Create a fresh operation record in Redis and return its id."""
    op_id = "ycop_" + secrets.token_hex(8)
    initial.setdefault("status", "running")
    initial.setdefault("created_at", time.time())
    initial["updated_at"] = time.time()
    await get_redis().set(_op_key(op_id), json.dumps(initial), ex=_OP_TTL_S)
    return op_id


async def _op_update(op_id: str, **patch: Any) -> None:
    """Merge ``patch`` into the stored state. No-op if the record expired."""
    r = get_redis()
    raw = await r.get(_op_key(op_id))
    if not raw:
        return
    try:
        state = json.loads(raw)
    except Exception:  # noqa: BLE001
        state = {}
    state.update(patch)
    state["updated_at"] = time.time()
    await r.set(_op_key(op_id), json.dumps(state), ex=_OP_TTL_S)


async def _op_get(op_id: str) -> dict[str, Any] | None:
    raw = await get_redis().get(_op_key(op_id))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:  # noqa: BLE001
        return None


# ---- Idempotency: (course_id, contest_id) → homework_id mapping ----
#
# ``IntegrationConfig.settings.imported_contests`` is a plain JSON dict keyed
# by ``"{course_id}:{contest_id}"`` (string) so the same tenant-wide YC
# config can serve multiple courses — re-importing contest 73433 into
# course A doesn't shadow the homework we previously created in course B.
#
# Backwards-compat: older rows used the bare ``str(contest_id)`` key (one
# course per config). We still read that legacy key when no scoped entry
# exists, so people who imported before this fix don't suddenly re-create
# homeworks.


def _mapping_key(course_id: str | None, contest_id: int) -> str:
    return f"{course_id or '*'}:{contest_id}"


def _imported_homework_id(
    cfg: Any, contest_id: int, course_id: str | None = None
) -> str | None:
    """Return the homework_id we previously created for ``(course_id,
    contest_id)``. Falls back to the legacy contest-only key for rows
    written before the migration to scoped keys."""
    settings_obj = cfg.settings if isinstance(cfg.settings, dict) else {}
    mapping = settings_obj.get("imported_contests")
    if not isinstance(mapping, dict):
        return None
    scoped = mapping.get(_mapping_key(course_id, contest_id))
    if scoped is not None:
        return str(scoped)
    # Legacy single-course rows.
    legacy = mapping.get(str(contest_id)) or mapping.get(contest_id)
    return str(legacy) if legacy is not None else None


async def _record_imported_homework(
    *,
    config_id: str,
    contest_id: int,
    homework_id: str,
    course_id: str | None,
) -> None:
    """Persist ``(course_id, contest_id) → homework_id`` on the config."""
    sm = get_sessionmaker()
    async with sm() as s:
        repo = IntegrationConfigRepo(s)
        from sqlalchemy import select

        from integration_service.models.entities import IntegrationConfig

        row = (
            await s.execute(
                select(IntegrationConfig).where(IntegrationConfig.id == config_id)
            )
        ).scalar_one_or_none()
        if row is None:
            return
        settings_obj = dict(row.settings or {})
        mapping = dict(settings_obj.get("imported_contests") or {})
        mapping[_mapping_key(course_id, contest_id)] = str(homework_id)
        settings_obj["imported_contests"] = mapping
        row.settings = settings_obj
        await s.commit()
        _ = repo


async def _drop_imported_homework(
    *, config_id: str, contest_id: int, course_id: str | None
) -> None:
    """Remove a stale (course_id, contest_id) mapping entry."""
    sm = get_sessionmaker()
    async with sm() as s:
        from sqlalchemy import select

        from integration_service.models.entities import IntegrationConfig

        row = (
            await s.execute(
                select(IntegrationConfig).where(IntegrationConfig.id == config_id)
            )
        ).scalar_one_or_none()
        if row is None:
            return
        settings_obj = dict(row.settings or {})
        mapping = dict(settings_obj.get("imported_contests") or {})
        mapping.pop(_mapping_key(course_id, contest_id), None)
        # Also try the legacy bare key.
        mapping.pop(str(contest_id), None)
        mapping.pop(contest_id, None)
        settings_obj["imported_contests"] = mapping
        row.settings = settings_obj
        await s.commit()


async def _homework_exists(
    client: httpx.AsyncClient,
    *,
    settings: Any,
    homework_id: str,
    fwd_headers: dict[str, str],
) -> bool:
    """Probe course-service to see whether a previously created homework is
    still reachable (i.e. not soft-deleted). 200 ⇒ exists, 404 ⇒ gone,
    other statuses are treated as "exists, do not re-import" to err on the
    safe side."""
    url = (
        settings.course_service_url.rstrip("/")
        + f"/api/v1/homeworks/{homework_id}"
    )
    try:
        resp = await client.get(url, headers=fwd_headers)
    except httpx.HTTPError:
        return True  # transient — don't double-create on a network blip
    if resp.status_code == 404:
        return False
    return resp.status_code < 400


def _build_assignment_body(
    pr: RemoteProblem, contest_id: int, homework_id: int | None
) -> dict[str, Any]:
    """Compose an AssignmentCreate payload from a YC RemoteProblem.

    YC's public API doesn't return problem statements, so we synthesise a
    short HTML "header" with the limits + a deep-link back to Y.Contest's
    own page (which is the only place the rendered statement lives). The
    UI sanitises and renders this HTML through ``assignment-prose`` styles.
    """
    limit_parts: list[str] = []
    if pr.time_limit_ms:
        limit_parts.append(f"⏱ {pr.time_limit_ms / 1000:g} с")
    if pr.memory_limit_bytes:
        limit_parts.append(f"🧠 {pr.memory_limit_bytes // (1024 * 1024)} МБ")
    limits_line = " · ".join(limit_parts)

    yc_problem_url = (
        f"https://contest.yandex.ru/contest/{contest_id}"
        f"/problems/{pr.alias or pr.external_id}/"
    )
    header_html_parts: list[str] = []
    if limits_line:
        header_html_parts.append(
            f'<p style="color: var(--muted-foreground)">{limits_line}</p>'
        )
    header_html_parts.append(
        '<p>'
        f'<a href="{yc_problem_url}" target="_blank" rel="noopener">'
        '📄 Открыть условие на Yandex.Contest →'
        '</a>'
        '</p>'
    )
    header_html = "".join(header_html_parts)
    description = header_html + (pr.statement_html or "")
    slug = _slugify(
        f"yc-{contest_id}-{pr.alias or pr.external_id or pr.title}",
        fallback=f"yc-{contest_id}-task-{pr.position or 0}",
    )
    body: dict[str, Any] = {
        "title": pr.title,
        "slug": slug,
        "description": description,
        "max_score": 10,
        # YC problems carry no language — a task can be solved in any
        # compiler — so we leave the hint unset at creation time and let
        # the submission import fill it in from the dominant run language
        # (see ``_import_submissions_for_aliases``). A wrong "cpp" guess
        # here was the bug: Python contests displayed as C++.
        "language_hint": pr.language_hint,
        "external_bindings": [
            {
                "system": "yandex_contest",
                "external_assignment_id": (
                    f"{contest_id}:{pr.alias or pr.external_id}"
                ),
            }
        ],
    }
    if homework_id is not None:
        body["homework_id"] = homework_id
    return body


async def _create_assignments_from_problems(
    client: httpx.AsyncClient,
    course_id: str,
    homework_id: int | None,
    contest_id: int,
    problems: list[RemoteProblem],
    fwd_headers: dict[str, str],
    course_service_url: str,
    op_id: str | None = None,
) -> tuple[int, int, list[str], dict[str, str]]:
    """Loop problems and POST one assignment per item. Returns
    ``(created, failed, errors, alias_to_assignment_id)``.

    Slug-conflict retry: on 409 with "slug" in the detail, retry with
    ``slug-2``, ``slug-3`` … up to 20 times per problem. Non-slug 409s and
    other 4xx/5xx are surfaced immediately.
    """
    course_url = (
        course_service_url.rstrip("/")
        + f"/api/v1/courses/{course_id}/assignments"
    )
    created = 0
    failed = 0
    errors: list[str] = []
    alias_to_aid: dict[str, str] = {}
    for pr in problems:
        body = _build_assignment_body(pr, contest_id, homework_id)
        base_slug: str = body["slug"]
        last_text = ""
        for attempt in range(20):
            candidate = base_slug if attempt == 0 else f"{base_slug}-{attempt + 1}"
            if len(candidate) > 120:
                candidate = candidate[: 120 - len(str(attempt + 1)) - 1] + f"-{attempt + 1}"
            body["slug"] = candidate
            try:
                resp = await client.post(
                    course_url, headers=fwd_headers, json=body
                )
            except httpx.HTTPError as exc:
                failed += 1
                errors.append(f"{pr.alias or pr.title}: {exc}")
                break
            if 200 <= resp.status_code < 300:
                created += 1
                try:
                    body_json = resp.json()
                    aid = body_json.get("id")
                    if aid is not None and pr.alias:
                        alias_to_aid[str(pr.alias)] = str(aid)
                except Exception:  # noqa: BLE001
                    pass
                if op_id is not None:
                    await _op_update(
                        op_id,
                        problems_done=created,
                        problems_total=len(problems),
                        stage="creating_assignments",
                    )
                break
            last_text = resp.text
            if resp.status_code != 409 or "slug" not in last_text.lower():
                failed += 1
                errors.append(
                    f"{pr.alias or pr.title}: {resp.status_code} {last_text[:160]}"
                )
                break
            # slug conflict — loop with the next suffix
        else:
            failed += 1
            errors.append(
                f"{pr.alias or pr.title}: slug-exhausted after 20 attempts; "
                f"last 409: {last_text[:120]}"
            )
    return created, failed, errors, alias_to_aid


async def _import_submissions_for_aliases(
    *,
    adapter: YandexContestAdapter,
    cfg: Any,
    contest_id: int,
    alias_to_aid: dict[str, str],
    homework_id: Any,
    client: httpx.AsyncClient,
    fwd_headers: dict[str, str],
    settings: Any,
    op_id: str | None = None,
) -> tuple[int, list[str]]:
    """Pull contest submissions once, group by problem alias, then bulk-import
    users and post a per-assignment batchImport.

    Mirrors the single-assignment ``import-submissions`` endpoint but
    handles the whole contest at once. Returns ``(total_ingested, errors)``.
    """
    # Walk YC's submission list page-by-page. Each page costs ~PAGE_SIZE
    # × 0.1s on the /full GETs inside the adapter, so we bound the total
    # pages to keep the request within the gateway timeout headroom.
    PAGE_SIZE = 100
    MAX_PAGES = 30  # up to 3000 submissions per import call
    all_subs: list[Any] = []
    fetch_errors: list[str] = []
    pages_used = 0
    seen_run_ids: set[str] = set()
    for page_num in range(1, MAX_PAGES + 1):
        page_res = await adapter.import_submissions(
            cfg,
            {
                "contest_id": contest_id,
                "page": page_num,
                "limit": PAGE_SIZE,
            },
            since=None,
        )
        pages_used += 1
        if page_res.failed and not page_res.submissions:
            fetch_errors.extend(page_res.errors[:2])
            break
        page_new = [
            rs for rs in page_res.submissions if rs.external_id not in seen_run_ids
        ]
        for rs in page_new:
            seen_run_ids.add(rs.external_id)
        all_subs.extend(page_new)
        if op_id is not None:
            await _op_update(
                op_id,
                stage="fetching_submissions",
                submissions_fetched=len(all_subs),
                submissions_pages=pages_used,
            )
        # Stop when the page is short (we've reached the tail) or contained
        # nothing new (server returned an overlapping batch).
        if len(page_res.submissions) < PAGE_SIZE or not page_new:
            break

    # Synthesise an ImportResult-like object so the rest of the helper
    # works unchanged.
    class _Box:
        pass

    sub_res = _Box()
    sub_res.submissions = all_subs
    sub_res.failed = len(fetch_errors)
    sub_res.errors = fetch_errors

    logger.info(
        "yc.import_as_homework.subs_fetched",
        contest_id=contest_id,
        total=len(sub_res.submissions),
        pages=pages_used,
        fetch_failed=sub_res.failed,
        sample_aliases=list({
            getattr(rs, "problem_alias", None) for rs in sub_res.submissions[:20]
        }),
        unique_users=len({
            getattr(rs, "external_user_id", None) for rs in sub_res.submissions
        } - {None}),
        with_source=sum(1 for rs in sub_res.submissions if rs.source_code),
        with_login=sum(1 for rs in sub_res.submissions if rs.login),
        alias_map_keys=list(alias_to_aid.keys()),
    )
    if sub_res.failed and not sub_res.submissions:
        return 0, [f"submissions fetch: {e}" for e in sub_res.errors[:3]]

    by_alias: dict[str, list[Any]] = {}
    no_alias = 0
    for rs in sub_res.submissions:
        alias = getattr(rs, "problem_alias", None) or getattr(
            rs, "problem_id", None
        )
        if not alias:
            no_alias += 1
            continue
        by_alias.setdefault(str(alias), []).append(rs)

    errors: list[str] = []
    if no_alias:
        errors.append(f"{no_alias} submissions had no problem_alias")

    # No identity bulk-import: Yandex.Contest participants are not PlagLens
    # users. We persist them as opaque external identities (``yc:<uid>``)
    # and keep the human-readable label (full name from YC's ``author``
    # field, or the login if that's all the API gives us) on the submission
    # row via ``author_label``. The UI renders the label directly so
    # teachers see "Петров Александр Сергеевич" / "hse-compds-2024-69"
    # instead of opaque ``usr_…`` ids.

    total_ingested = 0
    for alias, subs in by_alias.items():
        aid = alias_to_aid.get(alias)
        if not aid:
            errors.append(
                f"alias {alias}: {len(subs)} submissions skipped (no matching assignment)"
            )
            continue
        # Derive the assignment's language from its runs. YC problems have
        # no language (a task can be solved in any compiler), so the
        # assignment was created with ``language_hint = None`` — now that
        # we've pulled the runs we set it from the dominant submission
        # language (e.g. "python3_13" → "python"). Best-effort: a failed
        # PATCH is logged but doesn't abort the submission import.
        lang_votes: Counter[str] = Counter(
            hint
            for rs in subs
            if (hint := _normalize_language_hint(getattr(rs, "language", None)))
        )
        if lang_votes:
            dominant_lang = lang_votes.most_common(1)[0][0]
            try:
                patch_resp = await client.patch(
                    settings.course_service_url.rstrip("/")
                    + f"/api/v1/assignments/{aid}",
                    headers=fwd_headers,
                    json={"language_hint": dominant_lang},
                )
                if patch_resp.status_code >= 400:
                    errors.append(
                        f"alias {alias}: language_hint patch "
                        f"{patch_resp.status_code} {patch_resp.text[:120]}"
                    )
            except httpx.HTTPError as exc:
                errors.append(
                    f"alias {alias}: language_hint patch failed: {exc!s}"
                )
        items: list[dict[str, Any]] = []
        for rs in subs:
            # Stable per-participant pseudo-id. Falls back to login when the
            # remote didn't surface a numeric uid; refuses the row outright
            # if neither is present (would collide on dedup constraint).
            if rs.external_user_id:
                author_id = f"yc:{rs.external_user_id}"
            elif rs.login:
                author_id = f"yc:login:{rs.login}"
            else:
                continue
            if not rs.source_code:
                continue
            # Human-readable display label. YC's public list endpoint puts
            # "Surname Name Patronymic" into the ``author`` field — we
            # mapped that into ``rs.login`` in the adapter — so this is
            # usually full name; falls back to uid only as a last resort.
            author_label = rs.login or rs.external_user_id
            # Composite external_id: ``yc:{contest}:{alias}:{runid}``. Per the
            # archive-only / idempotent-import contract, the same YC run must
            # collapse to a single submission across the whole tenant — so we
            # deliberately do NOT include the homework_id here. submission-
            # service's `uq_submission_external` (source, external_id,
            # tenant_id) then catches re-imports as `deduplicated`.
            composite_ext = f"yc:{contest_id}:{alias}:{rs.external_id}"
            items.append(
                {
                    "author_id": author_id,
                    "author_login": rs.login,
                    "author_label": author_label,
                    "language": rs.language,
                    "files": [
                        {
                            "path": rs.filename
                            or f"submission-{rs.external_id}.txt",
                            "content": rs.source_code,
                            "mime_type": "text/plain",
                        }
                    ],
                    "submitted_at": (
                        rs.submitted_at.isoformat()
                        if rs.submitted_at
                        else None
                    ),
                    "external_id": composite_ext,
                    "external_url": (
                        f"https://contest.yandex.ru/contest/{contest_id}"
                        f"/run-report/{rs.external_id}/"
                    ),
                    "external_verdict": rs.verdict,
                    "external_score": rs.score,
                }
            )
        if not items:
            continue
        submission_url = (
            settings.submission_service_url.rstrip("/")
            + f"/api/v1/assignments/{aid}/submissions:batchImport"
        )
        try:
            sr = await client.post(
                submission_url,
                headers=fwd_headers,
                json={
                    "course_id": cfg.course_id,
                    "source": "yandex_contest",
                    # Re-importing the same contest moves any pre-existing
                    # YC submissions onto the freshly-created assignment
                    # rows. Without this flag a re-import after deleting
                    # the original homework leaves the new tasks empty
                    # (rows still in DB but pointing at orphan asg id).
                    "rebind_existing": True,
                    "items": items,
                },
            )
        except httpx.HTTPError as exc:
            errors.append(f"alias {alias}: submission unreachable: {exc!s}")
            continue
        if sr.status_code >= 400:
            errors.append(f"alias {alias}: {sr.status_code} {sr.text[:120]}")
            continue
        try:
            body_json = sr.json()
            cr = int(body_json.get("created", 0))
            dd = int(body_json.get("deduplicated", 0))
            sk = int(body_json.get("skipped", 0))
            fl = int(body_json.get("failed", 0))
            total_ingested += cr
            if op_id is not None:
                await _op_update(
                    op_id,
                    stage="importing_submissions",
                    submissions_imported=total_ingested,
                )
            logger.info(
                "yc.import_as_homework.subs_batch",
                alias=alias,
                assignment_id=aid,
                sent=len(items),
                created=cr,
                deduplicated=dd,
                skipped=sk,
                failed=fl,
                first_item_status=(
                    body_json.get("items", [{}])[0].get("status")
                    if body_json.get("items")
                    else None
                ),
                first_item_reason=(
                    body_json.get("items", [{}])[0].get("reason")
                    if body_json.get("items")
                    else None
                ),
            )
            if cr == 0 and (dd or sk or fl):
                errors.append(
                    f"alias {alias}: 0 created (dedup={dd}, skipped={sk}, failed={fl})"
                )
        except Exception as exc:  # noqa: BLE001
            errors.append(f"alias {alias}: parse response: {exc!s}")
    return total_ingested, errors


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
            await _create_assignments_from_problems(
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
    state = await _op_get(op_id)
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
    existing_hw_id = _imported_homework_id(
        cfg_snapshot, contest_id, course_id=effective_course_id
    )
    if existing_hw_id:
        s = get_settings()
        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=s.httpx_timeout_seconds) as client:
            still_alive = await _homework_exists(
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
                await _drop_imported_homework(
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
            op_id = await _op_create({
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
            asyncio.create_task(
                _run_resync_submissions(
                    op_id=op_id,
                    cfg=cfg_snapshot,
                    contest_id=contest_id,
                    homework_id=str(existing_hw_id),
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
        await _drop_imported_homework(
            config_id=str(cfg.id),
            contest_id=contest_id,
            course_id=effective_course_id,
        )

    op_id = await _op_create({
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

    asyncio.create_task(
        _run_import_as_homework(
            op_id=op_id, cfg=cfg_snapshot, contest_id=contest_id
        )
    )
    return {"operation_id": op_id, "status_url": f"/api/v1/integrations/yandex-contest/import-operations/{op_id}"}


async def _run_import_as_homework(
    *, op_id: str, cfg: Any, contest_id: int
) -> None:
    """Background worker doing the actual sync (homework + assignments +
    submissions) and updating the Redis op state as it goes. Uses the
    cached super_admin service token because the user's bearer is not
    available out-of-request and would expire mid-import anyway."""
    settings = get_settings()
    try:
        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        # Probe YC token availability for clarity in the op state.
        token = await get_access_token(str(cfg.id)) if cfg.id else None
        if not token and isinstance(cfg.settings, dict):
            token = cfg.settings.get("oauth_token") or cfg.settings.get(
                "access_token"
            )
        if not token:
            await _op_update(
                op_id,
                status="failed",
                stage=None,
                errors=["no OAuth token for YC"],
            )
            return

        async with httpx.AsyncClient(
            timeout=settings.httpx_timeout_seconds
        ) as client:
            # 1. Fetch contest meta to learn its name.
            await _op_update(op_id, stage="fetching_contest")
            meta = await yc_get(client, token, f"contests/{contest_id}")
            contest_name = (
                (meta.get("name") if isinstance(meta, dict) else None)
                or (meta.get("title") if isinstance(meta, dict) else None)
                or f"Контест {contest_id}"
            )
            await _op_update(op_id, homework_title=contest_name)

            # 2. Create homework with slug-retry.
            await _op_update(op_id, stage="creating_homework")
            hw_slug_base = _slugify(
                contest_name, fallback=f"yc-contest-{contest_id}"
            )
            hw_url = (
                settings.course_service_url.rstrip("/")
                + f"/api/v1/courses/{cfg.course_id}/homeworks"
            )
            hw_resp = None
            last_text = ""
            for attempt in range(50):
                cand = hw_slug_base if attempt == 0 else f"{hw_slug_base}-{attempt + 1}"
                if len(cand) > 64:
                    cand = cand[: 64 - len(str(attempt + 1)) - 1] + f"-{attempt + 1}"
                hw_resp = await client.post(
                    hw_url,
                    headers=fwd,
                    json={
                        "title": contest_name,
                        "slug": cand,
                        "description": None,
                        # Archive-only lifecycle: created homeworks go
                        # straight to "active" (visible to students).
                        # Sending "draft" now fails Pydantic validation
                        # on the course-service Literal["active",
                        # "archived"] type.
                        "status": "active",
                    },
                )
                if hw_resp.status_code < 400:
                    break
                last_text = hw_resp.text
                if hw_resp.status_code != 409 or "slug" not in last_text.lower():
                    await _op_update(
                        op_id,
                        status="failed",
                        errors=[
                            f"create homework: {hw_resp.status_code} {last_text[:160]}"
                        ],
                    )
                    return
            else:
                await _op_update(
                    op_id,
                    status="failed",
                    errors=["homework slug exhausted after 50 attempts"],
                )
                return
            homework = hw_resp.json()
            homework_id = homework.get("id")
            homework_slug = homework.get("slug")
            await _op_update(
                op_id,
                homework_id=homework_id,
                homework_slug=homework_slug,
            )
            # Record the mapping right after the homework is created so that
            # if the import crashes mid-way we still treat the contest as
            # "claimed" and don't spawn a parallel homework on retry. The
            # short-circuit at the top of import_as_homework checks course-
            # service for liveness, so a stuck/incomplete homework can still
            # be repaired manually (delete it → re-import).
            if homework_id is not None and cfg.id is not None:
                try:
                    await _record_imported_homework(
                        config_id=str(cfg.id),
                        contest_id=contest_id,
                        homework_id=str(homework_id),
                        course_id=cfg.course_id,
                    )
                except Exception as exc:  # noqa: BLE001
                    # Mapping write is best-effort: the import itself proceeds
                    # and the user can manually re-run if dedup is essential.
                    logger.warning(
                        "yc.import_as_homework.mapping_save_failed",
                        op_id=op_id,
                        contest_id=contest_id,
                        homework_id=homework_id,
                        error=str(exc),
                    )

            # 3. Pull problems and turn them into assignments.
            adapter = YandexContestAdapter()
            result = await adapter.import_problems(
                cfg, {"contest_id": contest_id}
            )
            await _op_update(
                op_id,
                problems_total=len(result.problems),
                stage="creating_assignments",
            )
            try:
                hw_id_int = int(homework_id) if homework_id is not None else None
            except (TypeError, ValueError):
                hw_id_int = None
            alias_to_aid: dict[str, str] = {}
            per_item_errors: list[str] = []
            if result.problems:
                created, failed, per_item_errors, alias_to_aid = (
                    await _create_assignments_from_problems(
                        client,
                        course_id=cfg.course_id,
                        homework_id=hw_id_int,
                        contest_id=contest_id,
                        problems=result.problems,
                        fwd_headers=fwd,
                        course_service_url=settings.course_service_url,
                        op_id=op_id,
                    )
                )
            else:
                created, failed = 0, 0

            # 4. Submissions — same client, same service token. This is the
            # slow stage (1000+ /full GETs); the op state ticks per page +
            # per batchImport so the modal can show live numbers.
            sub_imported = 0
            sub_errors: list[str] = []
            if alias_to_aid:
                sub_imported, sub_errors = await _import_submissions_for_aliases(
                    adapter=adapter,
                    cfg=cfg,
                    contest_id=contest_id,
                    alias_to_aid=alias_to_aid,
                    homework_id=homework_id,
                    client=client,
                    fwd_headers=fwd,
                    settings=settings,
                    op_id=op_id,
                )

        await _op_update(
            op_id,
            status="completed",
            stage="done",
            problems_done=created,
            submissions_imported=sub_imported,
            errors=(result.errors + per_item_errors + sub_errors)[:10],
        )
        logger.info(
            "yc.import_as_homework.completed",
            op_id=op_id,
            contest_id=contest_id,
            homework_id=homework_id,
            created=created,
            sub_imported=sub_imported,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "yc.import_as_homework.failed",
            op_id=op_id,
            contest_id=contest_id,
            error=str(exc),
        )
        await _op_update(op_id, status="failed", errors=[str(exc)[:300]])


async def _run_resync_submissions(
    *, op_id: str, cfg: Any, contest_id: int, homework_id: str
) -> None:
    """Re-pull submissions for a contest whose homework + assignments already
    exist.

    Triggered when ``import-as-homework`` is invoked a second time on an
    already-imported contest. The original flow short-circuited to a
    dead-end "already imported" no-op, which left the user stuck whenever
    the first import only partially landed (the classic case: a batch of
    submissions failed and never came back). Here we instead rebuild
    ``alias → assignment_id`` from the existing assignments' external
    bindings and re-run the submission import. submission-service dedups by
    ``external_id`` so the re-run is idempotent — it only backfills the runs
    a previous attempt missed (and refreshes ``language_hint`` from them).
    """
    settings = get_settings()
    try:
        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        token = await get_access_token(str(cfg.id)) if cfg.id else None
        if not token and isinstance(cfg.settings, dict):
            token = cfg.settings.get("oauth_token") or cfg.settings.get(
                "access_token"
            )
        if not token:
            await _op_update(
                op_id, status="failed", stage=None, errors=["no OAuth token for YC"]
            )
            return

        async with httpx.AsyncClient(
            timeout=settings.httpx_timeout_seconds
        ) as client:
            # 1. Load the homework so the modal can show its name and the
            #    frontend can navigate to it on completion.
            await _op_update(op_id, stage="fetching_contest")
            hw_resp = await client.get(
                settings.course_service_url.rstrip("/")
                + f"/api/v1/homeworks/{homework_id}",
                headers=fwd,
            )
            if hw_resp.status_code >= 400:
                await _op_update(
                    op_id,
                    status="failed",
                    errors=[
                        f"load homework {homework_id}: "
                        f"{hw_resp.status_code} {hw_resp.text[:120]}"
                    ],
                )
                return
            hw_json = hw_resp.json()
            await _op_update(
                op_id,
                homework_slug=hw_json.get("slug"),
                homework_title=hw_json.get("title"),
            )

            # 2. List the homework's assignments and rebuild ``alias →
            #    assignment_id`` from their Yandex.Contest external bindings.
            #    ``limit=500`` comfortably covers any single contest in one
            #    page (course-service caps at 2000).
            asg_resp = await client.get(
                settings.course_service_url.rstrip("/")
                + f"/api/v1/homeworks/{homework_id}/assignments",
                headers=fwd,
                params={"limit": 500},
            )
            if asg_resp.status_code >= 400:
                await _op_update(
                    op_id,
                    status="failed",
                    errors=[
                        f"list assignments: "
                        f"{asg_resp.status_code} {asg_resp.text[:120]}"
                    ],
                )
                return
            rows = asg_resp.json().get("data", []) or []
            alias_to_aid: dict[str, str] = {}
            for row in rows:
                for binding in row.get("external_bindings", []) or []:
                    if binding.get("system") != "yandex_contest":
                        continue
                    ext = str(binding.get("external_assignment_id") or "")
                    # Bindings are stored as ``"{contest_id}:{alias}"``.
                    if ":" not in ext:
                        continue
                    c_part, alias = ext.split(":", 1)
                    if str(c_part) == str(contest_id) and alias:
                        alias_to_aid[alias] = str(row.get("id"))

            await _op_update(
                op_id,
                problems_total=len(alias_to_aid),
                stage="fetching_submissions",
            )
            if not alias_to_aid:
                await _op_update(
                    op_id,
                    status="completed",
                    stage="done",
                    errors=[
                        "no Yandex.Contest assignments found on this homework — "
                        "nothing to resync"
                    ],
                )
                return

            # 3. Re-run the submission import against the existing
            #    assignments (also refreshes language_hint from the runs).
            adapter = YandexContestAdapter()
            sub_imported, sub_errors = await _import_submissions_for_aliases(
                adapter=adapter,
                cfg=cfg,
                contest_id=contest_id,
                alias_to_aid=alias_to_aid,
                homework_id=homework_id,
                client=client,
                fwd_headers=fwd,
                settings=settings,
                op_id=op_id,
            )

        await _op_update(
            op_id,
            status="completed",
            stage="done",
            problems_done=len(alias_to_aid),
            submissions_imported=sub_imported,
            errors=sub_errors[:10],
        )
        logger.info(
            "yc.resync_submissions.completed",
            op_id=op_id,
            contest_id=contest_id,
            homework_id=homework_id,
            assignments=len(alias_to_aid),
            sub_imported=sub_imported,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "yc.resync_submissions.failed",
            op_id=op_id,
            contest_id=contest_id,
            error=str(exc),
        )
        await _op_update(op_id, status="failed", errors=[str(exc)[:300]])


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

        members = [
            {"user_id": it["user_id"], "role": "student"}
            for it in identity_result.get("items", [])
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
