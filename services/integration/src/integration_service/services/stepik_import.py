"""Stepik import-job orchestration (service layer).

Mirror of :mod:`integration_service.services.yc_import` for Stepik: turn a set
of manually-selected Stepik *steps* into a PlagLens homework whose assignments
are the steps, then (optionally) pull every student submission for each step
into submission-service so plagiarism / LLM-review pick them up.

The generic plumbing — Redis operation state (``op_*``), the ``ImportJob``
bookkeeping, slugify — is reused verbatim from ``yc_import`` so the two
importers behave identically from the modal's point of view.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

import httpx
import structlog
from sqlalchemy import select

from integration_service.adapters.base import RemoteProblem
from integration_service.adapters.stepik import (
    StepikAdapter,
    normalize_stepik_language,
)
from integration_service.common.db import get_sessionmaker
from integration_service.config import get_settings
from integration_service.models import IntegrationConfig
from integration_service.services.oauth import get_access_token
from integration_service.services.service_token import auth_headers as service_auth_headers
from integration_service.services.yc_import import (
    finalize_import_job,
    op_update,
    slugify,
    update_job_progress,
)

logger = structlog.get_logger(__name__)


# --------------------------------------------------------------------------- #
# Idempotency: (course_id, stepik_course_id) → homework_id, on the config.
# --------------------------------------------------------------------------- #
def _mapping_key(course_id: str | None, stepik_course_id: Any) -> str:
    return f"{course_id or '*'}:{stepik_course_id}"


def imported_stepik_homework_id(
    cfg: Any, stepik_course_id: Any, course_id: str | None = None
) -> str | None:
    settings_obj = cfg.settings if isinstance(cfg.settings, dict) else {}
    mapping = settings_obj.get("imported_stepik")
    if not isinstance(mapping, dict):
        return None
    hit = mapping.get(_mapping_key(course_id, stepik_course_id))
    return str(hit) if hit is not None else None


async def record_imported_stepik_homework(
    *, config_id: str, stepik_course_id: Any, homework_id: str, course_id: str | None
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
        mapping = dict(settings_obj.get("imported_stepik") or {})
        mapping[_mapping_key(course_id, stepik_course_id)] = str(homework_id)
        settings_obj["imported_stepik"] = mapping
        row.settings = settings_obj
        await s.commit()


async def drop_imported_stepik_homework(
    *, config_id: str, stepik_course_id: Any, course_id: str | None
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
        mapping = dict(settings_obj.get("imported_stepik") or {})
        mapping.pop(_mapping_key(course_id, stepik_course_id), None)
        settings_obj["imported_stepik"] = mapping
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


# --------------------------------------------------------------------------- #
# Assignment creation
# --------------------------------------------------------------------------- #
def _build_step_assignment_body(
    pr: RemoteProblem, stepik_course_id: Any, homework_id: int | None
) -> dict[str, Any]:
    lesson_id = (pr.extra or {}).get("lesson_id")
    step_url = (
        f"https://stepik.org/lesson/{lesson_id}/step/{pr.position}"
        if lesson_id and pr.position
        else f"https://stepik.org/course/{stepik_course_id}"
    )
    step_type = (pr.extra or {}).get("step_type")
    header_parts: list[str] = []
    if step_type and step_type != "code":
        header_parts.append(
            f'<p style="color: var(--muted-foreground)">Тип шага: {step_type}</p>'
        )
    header_parts.append(
        '<p>'
        f'<a href="{step_url}" target="_blank" rel="noopener">'
        '📄 Открыть шаг на Stepik →'
        '</a>'
        '</p>'
    )
    description = "".join(header_parts) + (pr.statement_html or "")
    slug = slugify(
        f"stepik-{stepik_course_id}-step-{pr.external_id}",
        fallback=f"stepik-{stepik_course_id}-task-{pr.position or 0}",
    )
    body: dict[str, Any] = {
        "title": pr.title,
        "slug": slug,
        "description": description,
        "max_score": 10,
        "language_hint": pr.language_hint,
        "external_bindings": [
            {
                "system": "stepik",
                "external_assignment_id": f"{stepik_course_id}:{pr.external_id}",
            }
        ],
    }
    if homework_id is not None:
        body["homework_id"] = homework_id
    return body


async def create_assignments_from_steps(
    client: httpx.AsyncClient,
    *,
    course_id: str,
    homework_id: int | None,
    stepik_course_id: Any,
    problems: list[RemoteProblem],
    fwd_headers: dict[str, str],
    course_service_url: str,
    op_id: str | None = None,
) -> tuple[int, int, list[str], dict[str, str]]:
    """POST one assignment per step. Returns ``(created, failed, errors,
    step_id → assignment_id)``. Slug-conflict retry up to 20 suffixes."""
    course_url = course_service_url.rstrip("/") + f"/api/v1/courses/{course_id}/assignments"
    created = 0
    failed = 0
    errors: list[str] = []
    step_to_aid: dict[str, str] = {}
    for pr in problems:
        body = _build_step_assignment_body(pr, stepik_course_id, homework_id)
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
                errors.append(f"step {pr.external_id}: {exc}")
                break
            if 200 <= resp.status_code < 300:
                created += 1
                try:
                    aid = resp.json().get("id")
                    if aid is not None:
                        step_to_aid[str(pr.external_id)] = str(aid)
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
                    f"step {pr.external_id}: {resp.status_code} {last_text[:160]}"
                )
                break
        else:
            failed += 1
            errors.append(f"step {pr.external_id}: slug exhausted; last {last_text[:120]}")
    return created, failed, errors, step_to_aid


# --------------------------------------------------------------------------- #
# Submission import
# --------------------------------------------------------------------------- #
async def import_submissions_for_steps(
    *,
    adapter: StepikAdapter,
    cfg: Any,
    stepik_course_id: Any,
    step_to_aid: dict[str, str],
    step_to_title: dict[str, str],
    client: httpx.AsyncClient,
    fwd_headers: dict[str, str],
    settings: Any,
    course_id: str,
    op_id: str | None = None,
    job_id: str | None = None,
) -> tuple[dict[str, Any], list[str]]:
    """For each (step → assignment), pull Stepik submissions and batch-import
    them into submission-service. Returns ``(stats, errors)``."""
    total_created = total_dedup = total_skipped = total_failed = 0
    total_fetched = 0
    errors: list[str] = []
    by_step_stats: dict[str, dict[str, Any]] = {}

    for step_id, aid in step_to_aid.items():
        res = await adapter.import_submissions(
            cfg, {"step_id": int(step_id)}, since=None
        )
        total_fetched += len(res.submissions)
        if op_id is not None:
            await op_update(
                op_id,
                stage="fetching_submissions",
                submissions_fetched=total_fetched,
            )
        if res.failed and not res.submissions:
            errors.extend(res.errors[:2])
            continue

        # Set the assignment language from the dominant submission language.
        lang_votes: Counter[str] = Counter(
            hint
            for rs in res.submissions
            if (hint := normalize_stepik_language(rs.language))
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
                    errors.append(f"step {step_id}: language patch {pr.status_code}")
            except httpx.HTTPError as exc:
                errors.append(f"step {step_id}: language patch failed: {exc!s}")

        items: list[dict[str, Any]] = []
        for rs in res.submissions:
            if not rs.source_code:
                continue
            if rs.external_user_id:
                author_id = f"stepik:{rs.external_user_id}"
            elif rs.login:
                author_id = f"stepik:login:{rs.login}"
            else:
                continue
            author_label = rs.login or rs.external_user_id
            composite_ext = f"stepik:{stepik_course_id}:{step_id}:{rs.external_id}"
            items.append(
                {
                    "author_id": author_id,
                    "author_login": rs.login,
                    "author_label": author_label,
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
                    "external_id": composite_ext,
                    "external_url": (
                        f"https://stepik.org/submissions/{rs.external_id}"
                    ),
                    "external_verdict": rs.verdict,
                    "external_score": rs.score,
                }
            )
        if not items:
            by_step_stats[step_id] = {
                "title": step_to_title.get(step_id) or f"Шаг {step_id}",
                "scanned": 0, "created": 0, "deduplicated": 0, "skipped": 0, "failed": 0,
            }
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
                    "source": "stepik",
                    "rebind_existing": True,
                    "items": items,
                },
            )
        except httpx.HTTPError as exc:
            errors.append(f"step {step_id}: submission unreachable: {exc!s}")
            continue
        if sr.status_code >= 400:
            detail = sr.text[:160]
            try:
                body = sr.json()
                if isinstance(body, dict):
                    if body.get("errors"):
                        detail = "; ".join(
                            f"{e.get('field')}: {e.get('message')}"
                            for e in body["errors"][:4]
                        )
                    elif body.get("detail"):
                        detail = str(body["detail"])
            except Exception:  # noqa: BLE001
                pass
            errors.append(f"step {step_id}: {sr.status_code} {detail}")
            logger.warning(
                "stepik.batch_import_4xx",
                step_id=step_id,
                assignment_id=aid,
                status=sr.status_code,
                body=sr.text[:500],
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
        by_step_stats[step_id] = {
            "title": step_to_title.get(step_id) or f"Шаг {step_id}",
            "scanned": cr + dd + sk + fl,
            "created": cr, "deduplicated": dd, "skipped": sk, "failed": fl,
        }
        if op_id is not None:
            await op_update(
                op_id, stage="importing_submissions", submissions_imported=total_created
            )
        if job_id is not None:
            await update_job_progress(
                job_id,
                stage="importing_submissions",
                submissions_imported=total_created,
                current_problem=step_to_title.get(step_id) or step_id,
            )

    stats = {
        "created": total_created,
        "deduplicated": total_dedup,
        "skipped": total_skipped,
        "failed": total_failed,
        "by_step": by_step_stats,
    }
    return stats, errors


# --------------------------------------------------------------------------- #
# Background workers
# --------------------------------------------------------------------------- #
async def _resolve_token(cfg: Any) -> str | None:
    token = await get_access_token(str(cfg.id)) if cfg.id else None
    if not token and isinstance(cfg.settings, dict):
        token = (
            cfg.settings.get("static_token")
            or cfg.settings.get("oauth_token")
            or cfg.settings.get("access_token")
        )
    return token


async def run_import_steps_as_homework(
    *,
    op_id: str,
    cfg: Any,
    course_id: str,
    stepik_course_id: Any,
    step_ids: list[int],
    title: str | None = None,
    job_id: str | None = None,
) -> None:
    """Create a homework from the selected Stepik steps + import submissions."""
    settings = get_settings()
    try:
        token = await _resolve_token(cfg)
        if not token:
            await op_update(op_id, status="failed", stage=None, errors=["no Stepik token"])
            if job_id:
                await finalize_import_job(
                    job_id=job_id, config_id=str(cfg.id), status="failed",
                    errors=["no Stepik token"],
                )
            return

        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        hw_title = title or f"Stepik {stepik_course_id}"

        async with httpx.AsyncClient(timeout=settings.httpx_timeout_seconds) as client:
            # 1. Create homework (slug-retry).
            await op_update(op_id, stage="creating_homework", homework_title=hw_title)
            hw_slug_base = slugify(hw_title, fallback=f"stepik-{stepik_course_id}")
            hw_url = (
                settings.course_service_url.rstrip("/")
                + f"/api/v1/courses/{course_id}/homeworks"
            )
            homework = None
            last_text = ""
            for attempt in range(50):
                cand = hw_slug_base if attempt == 0 else f"{hw_slug_base}-{attempt + 1}"
                if len(cand) > 64:
                    cand = cand[: 64 - len(str(attempt + 1)) - 1] + f"-{attempt + 1}"
                hw_resp = await client.post(
                    hw_url,
                    headers=fwd,
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
                            job_id=job_id, config_id=str(cfg.id), status="failed",
                            errors=[err],
                        )
                    return
            if homework is None:
                err = "homework slug exhausted"
                await op_update(op_id, status="failed", errors=[err])
                if job_id:
                    await finalize_import_job(
                        job_id=job_id, config_id=str(cfg.id), status="failed", errors=[err]
                    )
                return

            homework_id = homework.get("id")
            await op_update(
                op_id, homework_id=homework_id, homework_slug=homework.get("slug")
            )
            if homework_id is not None and cfg.id is not None:
                try:
                    await record_imported_stepik_homework(
                        config_id=str(cfg.id),
                        stepik_course_id=stepik_course_id,
                        homework_id=str(homework_id),
                        course_id=course_id,
                    )
                except Exception as exc:  # noqa: BLE001
                    logger.warning("stepik.import.mapping_save_failed", error=str(exc))

            # 2. Fetch step metadata → problems → assignments.
            adapter = StepikAdapter()
            await op_update(op_id, stage="creating_assignments")
            prob_res = await adapter.import_problems(
                cfg, {"step_ids": step_ids, "stepik_course_id": stepik_course_id}
            )
            await op_update(op_id, problems_total=len(prob_res.problems))
            try:
                hw_id_int = int(homework_id) if homework_id is not None else None
            except (TypeError, ValueError):
                hw_id_int = None
            step_to_aid: dict[str, str] = {}
            create_errors: list[str] = []
            created = 0
            if prob_res.problems:
                created, _failed, create_errors, step_to_aid = (
                    await create_assignments_from_steps(
                        client,
                        course_id=course_id,
                        homework_id=hw_id_int,
                        stepik_course_id=stepik_course_id,
                        problems=prob_res.problems,
                        fwd_headers=fwd,
                        course_service_url=settings.course_service_url,
                        op_id=op_id,
                    )
                )
            step_to_title = {
                str(pr.external_id): pr.title for pr in prob_res.problems
            }

            # 3. Submissions.
            sub_stats: dict[str, Any] = {
                "created": 0, "deduplicated": 0, "skipped": 0, "failed": 0, "by_step": {}
            }
            sub_errors: list[str] = []
            if step_to_aid:
                sub_stats, sub_errors = await import_submissions_for_steps(
                    adapter=adapter,
                    cfg=cfg,
                    stepik_course_id=stepik_course_id,
                    step_to_aid=step_to_aid,
                    step_to_title=step_to_title,
                    client=client,
                    fwd_headers=fwd,
                    settings=settings,
                    course_id=course_id,
                    op_id=op_id,
                    job_id=job_id,
                )

        combined = (prob_res.errors + create_errors + sub_errors)[:10]
        await op_update(
            op_id,
            status="completed",
            stage="done",
            problems_done=created,
            submissions_imported=sub_stats["created"],
            errors=combined,
        )
        logger.info(
            "stepik.import_as_homework.completed",
            op_id=op_id,
            stepik_course_id=stepik_course_id,
            homework_id=homework_id,
            assignments=created,
            sub_created=sub_stats["created"],
            sub_dedup=sub_stats["deduplicated"],
        )
        if job_id:
            await finalize_import_job(
                job_id=job_id,
                config_id=str(cfg.id),
                status="completed",
                imported=sub_stats["created"],
                deduplicated=sub_stats["deduplicated"],
                skipped=sub_stats["skipped"],
                failed=sub_stats["failed"],
                errors=combined,
                homeworks=[
                    {
                        "homework_id": str(homework_id),
                        "title": hw_title,
                        "scanned": (
                            sub_stats["created"]
                            + sub_stats["deduplicated"]
                            + sub_stats["skipped"]
                            + sub_stats["failed"]
                        ),
                        "created": sub_stats["created"],
                        "deduplicated": sub_stats["deduplicated"],
                        "problems": [
                            {
                                "title": v.get("title") or k,
                                "scanned": v.get("scanned", 0),
                                "created": v.get("created", 0),
                                "deduplicated": v.get("deduplicated", 0),
                            }
                            for k, v in (sub_stats.get("by_step") or {}).items()
                        ],
                    }
                ],
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception(
            "stepik.import_as_homework.failed", op_id=op_id, error=str(exc)
        )
        await op_update(op_id, status="failed", errors=[str(exc)[:300]])
        if job_id:
            await finalize_import_job(
                job_id=job_id, config_id=str(cfg.id), status="failed",
                errors=[str(exc)[:300]],
            )


async def run_resync_stepik(
    *,
    op_id: str,
    cfg: Any,
    course_id: str,
    stepik_course_id: Any,
    homework_id: str,
    job_id: str | None = None,
) -> None:
    """Re-pull submissions for an already-imported Stepik homework. Rebuilds
    ``step → assignment`` from the assignments' Stepik external bindings and
    re-runs the submission import (idempotent — submission-service dedups)."""
    settings = get_settings()
    try:
        token = await _resolve_token(cfg)
        if not token:
            await op_update(op_id, status="failed", errors=["no Stepik token"])
            if job_id:
                await finalize_import_job(
                    job_id=job_id, config_id=str(cfg.id), status="failed",
                    errors=["no Stepik token"],
                )
            return
        s2s = await service_auth_headers()
        fwd = {**s2s, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=settings.httpx_timeout_seconds) as client:
            await op_update(op_id, stage="creating_assignments")
            hw_resp = await client.get(
                settings.course_service_url.rstrip("/")
                + f"/api/v1/homeworks/{homework_id}",
                headers=fwd,
            )
            if hw_resp.status_code < 400:
                hw_json = hw_resp.json()
                await op_update(
                    op_id,
                    homework_slug=hw_json.get("slug"),
                    homework_title=hw_json.get("title"),
                )
            asg_resp = await client.get(
                settings.course_service_url.rstrip("/")
                + f"/api/v1/homeworks/{homework_id}/assignments",
                headers=fwd,
                params={"limit": 500},
            )
            if asg_resp.status_code >= 400:
                err = f"list assignments: {asg_resp.status_code}"
                await op_update(op_id, status="failed", errors=[err])
                if job_id:
                    await finalize_import_job(
                        job_id=job_id, config_id=str(cfg.id), status="failed", errors=[err]
                    )
                return
            rows = asg_resp.json().get("data", []) or []
            step_to_aid: dict[str, str] = {}
            step_to_title: dict[str, str] = {}
            for row in rows:
                for binding in row.get("external_bindings", []) or []:
                    if binding.get("system") != "stepik":
                        continue
                    ext = str(binding.get("external_assignment_id") or "")
                    if ":" not in ext:
                        continue
                    _course_part, step_part = ext.split(":", 1)
                    if step_part:
                        step_to_aid[step_part] = str(row.get("id"))
                        if row.get("title"):
                            step_to_title[step_part] = str(row["title"])
            await op_update(op_id, problems_total=len(step_to_aid), stage="fetching_submissions")
            if not step_to_aid:
                await op_update(op_id, status="completed", stage="done", errors=["no Stepik assignments to resync"])
                if job_id:
                    await finalize_import_job(
                        job_id=job_id, config_id=str(cfg.id), status="completed",
                        errors=["nothing to resync"],
                    )
                return
            adapter = StepikAdapter()
            sub_stats, sub_errors = await import_submissions_for_steps(
                adapter=adapter,
                cfg=cfg,
                stepik_course_id=stepik_course_id,
                step_to_aid=step_to_aid,
                step_to_title=step_to_title,
                client=client,
                fwd_headers=fwd,
                settings=settings,
                course_id=course_id,
                op_id=op_id,
                job_id=job_id,
            )
        await op_update(
            op_id,
            status="completed",
            stage="done",
            problems_done=len(step_to_aid),
            submissions_imported=sub_stats["created"],
            errors=sub_errors[:10],
        )
        if job_id:
            await finalize_import_job(
                job_id=job_id,
                config_id=str(cfg.id),
                status="completed",
                imported=sub_stats["created"],
                deduplicated=sub_stats["deduplicated"],
                skipped=sub_stats["skipped"],
                failed=sub_stats["failed"],
                errors=sub_errors[:10],
            )
    except Exception as exc:  # noqa: BLE001
        logger.exception("stepik.resync.failed", op_id=op_id, error=str(exc))
        await op_update(op_id, status="failed", errors=[str(exc)[:300]])
        if job_id:
            await finalize_import_job(
                job_id=job_id, config_id=str(cfg.id), status="failed",
                errors=[str(exc)[:300]],
            )
