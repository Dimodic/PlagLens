"""eJudge import-job orchestration (service layer).

Mirror of ``yc_import`` for eJudge: a contest becomes a PlagLens homework whose
assignments are the (manually-selected) contest problems, and every run for
those problems is pulled into submission-service for plagiarism / LLM review.

Reuses the generic plumbing (Redis op-state, ImportJob bookkeeping, slugify)
from ``yc_import`` so the import modal behaves identically.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import httpx
import structlog
from sqlalchemy import select

from integration_service.adapters.base import RemoteProblem
from integration_service.adapters.ejudge import (
    EjudgeAdapter,
    normalize_ejudge_language,
)
from integration_service.common.db import get_sessionmaker
from integration_service.config import get_settings
from integration_service.models import IntegrationConfig
from integration_service.services.service_token import auth_headers as service_auth_headers
from integration_service.services.yc_import import (
    finalize_import_job,
    op_update,
    slugify,
    update_job_progress,
)

logger = structlog.get_logger(__name__)

_RUN_PAGE_LIMIT = 60
_RUN_MAX_PAGES = 30  # up to ~1800 runs per import


# ---- idempotency: (course_id, contest_id) → homework_id ----
def _mapping_key(course_id: str | None, contest_id: Any) -> str:
    return f"{course_id or '*'}:{contest_id}"


def imported_ejudge_homework_id(
    cfg: Any, contest_id: Any, course_id: str | None = None
) -> str | None:
    settings_obj = cfg.settings if isinstance(cfg.settings, dict) else {}
    mapping = settings_obj.get("imported_ejudge")
    if not isinstance(mapping, dict):
        return None
    hit = mapping.get(_mapping_key(course_id, contest_id))
    return str(hit) if hit is not None else None


async def record_imported_ejudge_homework(
    *, config_id: str, contest_id: Any, homework_id: str, course_id: str | None
) -> None:
    sm = get_sessionmaker()
    async with sm() as s:
        row = (
            await s.execute(
                select(IntegrationConfig).where(IntegrationConfig.id == config_id)
            )
        ).scalar_one_or_none()
        if row is None:
            return
        settings_obj = dict(row.settings or {})
        mapping = dict(settings_obj.get("imported_ejudge") or {})
        mapping[_mapping_key(course_id, contest_id)] = str(homework_id)
        settings_obj["imported_ejudge"] = mapping
        row.settings = settings_obj
        await s.commit()


async def drop_imported_ejudge_homework(
    *, config_id: str, contest_id: Any, course_id: str | None
) -> None:
    sm = get_sessionmaker()
    async with sm() as s:
        row = (
            await s.execute(
                select(IntegrationConfig).where(IntegrationConfig.id == config_id)
            )
        ).scalar_one_or_none()
        if row is None:
            return
        settings_obj = dict(row.settings or {})
        mapping = dict(settings_obj.get("imported_ejudge") or {})
        mapping.pop(_mapping_key(course_id, contest_id), None)
        settings_obj["imported_ejudge"] = mapping
        row.settings = settings_obj
        await s.commit()


async def homework_exists(
    client: httpx.AsyncClient, *, settings: Any, homework_id: str, fwd_headers: dict[str, str]
) -> bool:
    url = settings.course_service_url.rstrip("/") + f"/api/v1/homeworks/{homework_id}"
    try:
        resp = await client.get(url, headers=fwd_headers)
    except httpx.HTTPError:
        return True
    if resp.status_code == 404:
        return False
    return resp.status_code < 400


# ---- assignment creation ----
def _build_problem_assignment_body(
    pr: RemoteProblem, contest_id: Any, base_url: str | None, homework_id: int | None
) -> dict[str, Any]:
    link = ""
    if base_url:
        link = (
            f'<p><a href="{base_url.rstrip("/")}/" target="_blank" rel="noopener">'
            "📄 Открыть в eJudge →</a></p>"
        )
    description = link + (pr.statement_html or "")
    slug = slugify(
        f"ejudge-{contest_id}-{pr.alias or pr.external_id}",
        fallback=f"ejudge-{contest_id}-task-{pr.position or 0}",
    )
    body: dict[str, Any] = {
        "title": pr.title,
        "slug": slug,
        "description": description,
        "max_score": 10,
        "language_hint": None,
        "external_bindings": [
            {
                "system": "ejudge",
                "external_assignment_id": f"{contest_id}:{pr.alias or pr.external_id}",
            }
        ],
    }
    if homework_id is not None:
        body["homework_id"] = homework_id
    return body


async def create_assignments_from_problems(
    client: httpx.AsyncClient,
    *,
    course_id: str,
    homework_id: int | None,
    contest_id: Any,
    base_url: str | None,
    problems: list[RemoteProblem],
    fwd_headers: dict[str, str],
    course_service_url: str,
    op_id: str | None = None,
) -> tuple[int, int, list[str], dict[str, str]]:
    """POST one assignment per problem. Returns ``(created, failed, errors,
    key → assignment_id)`` where ``key`` is registered under BOTH the problem
    alias and its external id so runs can match by either."""
    course_url = course_service_url.rstrip("/") + f"/api/v1/courses/{course_id}/assignments"
    created = 0
    failed = 0
    errors: list[str] = []
    key_to_aid: dict[str, str] = {}
    for pr in problems:
        body = _build_problem_assignment_body(pr, contest_id, base_url, homework_id)
        base_slug = body["slug"]
        last_text = ""
        for attempt in range(20):
            candidate = base_slug if attempt == 0 else f"{base_slug}-{attempt + 1}"
            if len(candidate) > 120:
                candidate = candidate[: 120 - len(str(attempt + 1)) - 1] + f"-{attempt + 1}"
            body["slug"] = candidate
            try:
                resp = await client.post(course_url, headers=fwd_headers, json=body)
            except httpx.HTTPError as exc:
                failed += 1
                errors.append(f"problem {pr.alias or pr.external_id}: {exc}")
                break
            if 200 <= resp.status_code < 300:
                created += 1
                try:
                    aid = resp.json().get("id")
                    if aid is not None:
                        if pr.alias:
                            key_to_aid[str(pr.alias)] = str(aid)
                        if pr.external_id:
                            key_to_aid[str(pr.external_id)] = str(aid)
                except Exception:  # noqa: BLE001
                    pass
                if op_id is not None:
                    await op_update(
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
                    f"problem {pr.alias or pr.external_id}: {resp.status_code} {last_text[:160]}"
                )
                break
        else:
            failed += 1
            errors.append(
                f"problem {pr.alias or pr.external_id}: slug exhausted; {last_text[:120]}"
            )
    return created, failed, errors, key_to_aid


# ---- submission import ----
async def import_submissions_for_problems(
    *,
    adapter: EjudgeAdapter,
    cfg: Any,
    contest_id: Any,
    key_to_aid: dict[str, str],
    key_to_title: dict[str, str],
    client: httpx.AsyncClient,
    fwd_headers: dict[str, str],
    settings: Any,
    course_id: str,
    op_id: str | None = None,
    job_id: str | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """Page through the contest's runs, group by problem, batch-import each
    problem's runs into its assignment."""
    # 1. Pull runs page-by-page (cursor on max_run_id).
    all_runs: list[Any] = []
    errors: list[str] = []
    cursor: dict[str, Any] = {}
    for _ in range(_RUN_MAX_PAGES):
        res = await adapter.import_submissions(
            cfg,
            {"contest_id": contest_id, "limit": _RUN_PAGE_LIMIT, "cursor": cursor},
            since=None,
        )
        if res.failed and not res.submissions:
            errors.extend(res.errors[:2])
            break
        all_runs.extend(res.submissions)
        if op_id is not None:
            await op_update(
                op_id, stage="fetching_submissions", submissions_fetched=len(all_runs)
            )
        if len(res.submissions) < _RUN_PAGE_LIMIT or not res.cursor:
            break
        if res.cursor == cursor:
            break  # cursor didn't advance — avoid an infinite loop
        cursor = res.cursor

    # 2. Group by problem (alias first, then problem_id).
    by_key: dict[str, list[Any]] = {}
    for rs in all_runs:
        key = rs.problem_alias or rs.problem_id
        if not key:
            continue
        by_key.setdefault(str(key), []).append(rs)

    total_created = total_dedup = total_skipped = total_failed = 0
    by_problem_stats: dict[str, dict[str, Any]] = {}
    for key, runs in by_key.items():
        aid = key_to_aid.get(key)
        if not aid:
            continue
        lang_votes: Counter[str] = Counter(
            hint
            for rs in runs
            if (hint := normalize_ejudge_language(rs.language))
        )
        if lang_votes:
            dominant = lang_votes.most_common(1)[0][0]
            try:
                pr = await client.patch(
                    settings.course_service_url.rstrip("/") + f"/api/v1/assignments/{aid}",
                    headers=fwd_headers,
                    json={"language_hint": dominant},
                )
                if pr.status_code >= 400:
                    errors.append(f"problem {key}: language patch {pr.status_code}")
            except httpx.HTTPError as exc:
                errors.append(f"problem {key}: language patch failed: {exc!s}")

        items: list[dict[str, Any]] = []
        for rs in runs:
            if not rs.source_code:
                continue
            if rs.external_user_id:
                author_id = f"ejudge:{rs.external_user_id}"
            elif rs.login:
                author_id = f"ejudge:login:{rs.login}"
            else:
                continue
            items.append(
                {
                    "author_id": author_id,
                    "author_login": rs.login,
                    "author_label": rs.login or rs.external_user_id,
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
                    "external_id": f"ejudge:{contest_id}:{key}:{rs.external_id}",
                    "external_verdict": rs.verdict,
                    "external_score": rs.score,
                }
            )
        if not items:
            continue
        url = (
            settings.submission_service_url.rstrip("/")
            + f"/api/v1/assignments/{aid}/submissions:batchImport"
        )
        try:
            sr = await client.post(
                url,
                headers=fwd_headers,
                json={
                    "course_id": course_id,
                    "source": "ejudge",
                    "rebind_existing": True,
                    "items": items,
                },
            )
        except httpx.HTTPError as exc:
            errors.append(f"problem {key}: submission unreachable: {exc!s}")
            continue
        if sr.status_code >= 400:
            errors.append(f"problem {key}: {sr.status_code} {sr.text[:160]}")
            logger.warning(
                "ejudge.batch_import_4xx", problem=key, assignment_id=aid,
                status=sr.status_code, body=sr.text[:400],
            )
            continue
        try:
            body = sr.json()
            cr = int(body.get("created", 0))
            dd = int(body.get("deduplicated", 0))
            sk = int(body.get("skipped", 0))
            fl = int(body.get("failed", 0))
        except Exception:  # noqa: BLE001
            cr = dd = sk = fl = 0
        total_created += cr
        total_dedup += dd
        total_skipped += sk
        total_failed += fl
        by_problem_stats[key] = {
            "title": key_to_title.get(key) or f"Задача {key}",
            "scanned": cr + dd + sk + fl,
            "created": cr, "deduplicated": dd, "skipped": sk, "failed": fl,
        }
        if op_id is not None:
            await op_update(
                op_id, stage="importing_submissions", submissions_imported=total_created
            )
        if job_id is not None:
            await update_job_progress(
                job_id, stage="importing_submissions",
                submissions_imported=total_created,
                current_problem=key_to_title.get(key) or key,
            )

    stats = {
        "created": total_created,
        "deduplicated": total_dedup,
        "skipped": total_skipped,
        "failed": total_failed,
        "by_problem": by_problem_stats,
    }
    return stats, errors


async def run_import_as_homework(
    *,
    op_id: str,
    cfg: Any,
    contest_id: Any,
    job_id: str | None = None,
    problem_aliases: list[str] | None = None,
) -> None:
    settings = get_settings()
    base_url = (
        (cfg.settings or {}).get("base_url") if isinstance(cfg.settings, dict) else None
    )
    try:
        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        adapter = EjudgeAdapter()
        async with httpx.AsyncClient(timeout=settings.httpx_timeout_seconds) as client:
            # 1. Resolve contest title.
            await op_update(op_id, stage="fetching_contest")
            contests = await adapter.list_remote_courses(cfg)
            contest = next(
                (c for c in contests if str(c.external_id) == str(contest_id)), None
            )
            hw_title = (contest.title if contest else None) or f"eJudge {contest_id}"
            await op_update(op_id, homework_title=hw_title, stage="creating_homework")

            # 2. Create homework (slug-retry).
            hw_slug_base = slugify(hw_title, fallback=f"ejudge-{contest_id}")
            hw_url = (
                settings.course_service_url.rstrip("/")
                + f"/api/v1/courses/{cfg.course_id}/homeworks"
            )
            homework = None
            last_text = ""
            for attempt in range(50):
                cand = hw_slug_base if attempt == 0 else f"{hw_slug_base}-{attempt + 1}"
                if len(cand) > 64:
                    cand = cand[: 64 - len(str(attempt + 1)) - 1] + f"-{attempt + 1}"
                hw_resp = await client.post(
                    hw_url, headers=fwd,
                    json={"title": hw_title, "slug": cand, "status": "active"},
                )
                if hw_resp.status_code < 400:
                    homework = hw_resp.json()
                    break
                last_text = hw_resp.text
                if hw_resp.status_code != 409 or "slug" not in last_text.lower():
                    err = f"create homework: {hw_resp.status_code} {last_text[:160]}"
                    await op_update(op_id, status="failed", errors=[err])
                    if job_id:
                        await finalize_import_job(
                            job_id=job_id, config_id=str(cfg.id), status="failed", errors=[err]
                        )
                    return
            if homework is None:
                await op_update(op_id, status="failed", errors=["homework slug exhausted"])
                if job_id:
                    await finalize_import_job(
                        job_id=job_id, config_id=str(cfg.id), status="failed",
                        errors=["homework slug exhausted"],
                    )
                return
            homework_id = homework.get("id")
            await op_update(op_id, homework_id=homework_id, homework_slug=homework.get("slug"))
            if homework_id is not None and cfg.id is not None:
                try:
                    await record_imported_ejudge_homework(
                        config_id=str(cfg.id), contest_id=contest_id,
                        homework_id=str(homework_id), course_id=cfg.course_id,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("ejudge.import.mapping_save_failed", error=str(exc))

            # 3. Problems → assignments (filtered to the manual selection).
            await op_update(op_id, stage="creating_assignments")
            prob_res = await adapter.import_problems(cfg, {"contest_id": contest_id})
            problems = prob_res.problems
            if problem_aliases:
                wanted = {str(a) for a in problem_aliases}
                problems = [
                    pr for pr in problems
                    if str(pr.alias or pr.external_id) in wanted
                ]
            await op_update(op_id, problems_total=len(problems))
            try:
                hw_id_int = int(homework_id) if homework_id is not None else None
            except (TypeError, ValueError):
                hw_id_int = None
            key_to_aid: dict[str, str] = {}
            create_errors: list[str] = []
            created = 0
            if problems:
                created, _failed, create_errors, key_to_aid = (
                    await create_assignments_from_problems(
                        client,
                        course_id=cfg.course_id,
                        homework_id=hw_id_int,
                        contest_id=contest_id,
                        base_url=base_url,
                        problems=problems,
                        fwd_headers=fwd,
                        course_service_url=settings.course_service_url,
                        op_id=op_id,
                    )
                )
            key_to_title: dict[str, str] = {}
            for pr in problems:
                if pr.alias:
                    key_to_title[str(pr.alias)] = pr.title
                if pr.external_id:
                    key_to_title[str(pr.external_id)] = pr.title

            # 4. Submissions.
            sub_stats: dict[str, Any] = {
                "created": 0, "deduplicated": 0, "skipped": 0, "failed": 0, "by_problem": {}
            }
            sub_errors: list[str] = []
            if key_to_aid:
                sub_stats, sub_errors = await import_submissions_for_problems(
                    adapter=adapter,
                    cfg=cfg,
                    contest_id=contest_id,
                    key_to_aid=key_to_aid,
                    key_to_title=key_to_title,
                    client=client,
                    fwd_headers=fwd,
                    settings=settings,
                    course_id=cfg.course_id,
                    op_id=op_id,
                    job_id=job_id,
                )

        combined = (prob_res.errors + create_errors + sub_errors)[:10]
        await op_update(
            op_id, status="completed", stage="done",
            problems_done=created, submissions_imported=sub_stats["created"],
            errors=combined,
        )
        logger.info(
            "ejudge.import_as_homework.completed", op_id=op_id, contest_id=contest_id,
            homework_id=homework_id, assignments=created,
            sub_created=sub_stats["created"], sub_dedup=sub_stats["deduplicated"],
        )
        if job_id:
            await finalize_import_job(
                job_id=job_id, config_id=str(cfg.id), status="completed",
                imported=sub_stats["created"], deduplicated=sub_stats["deduplicated"],
                skipped=sub_stats["skipped"], failed=sub_stats["failed"], errors=combined,
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception("ejudge.import_as_homework.failed", op_id=op_id, error=str(exc))
        await op_update(op_id, status="failed", errors=[str(exc)[:300]])
        if job_id:
            await finalize_import_job(
                job_id=job_id, config_id=str(cfg.id), status="failed", errors=[str(exc)[:300]]
            )
