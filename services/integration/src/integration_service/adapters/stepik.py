"""Stepik adapter — OAuth + httpx access to the Stepik REST API.

Beyond connection-test and course/step browsing, this carries the two
import-grade extractors used by the import-as-homework pipeline
(``services/stepik_import.py``):

* ``import_problems`` — turn selected Stepik *steps* into ``RemoteProblem``s
  (statement = the step's ``block.text`` HTML, title = lesson + position).
* ``import_submissions`` — pull every submission for a step and resolve it to
  ``(author, source, language, verdict)``. Stepik puts the learner on the
  *attempt*, not the submission, so we batch-resolve ``attempt → user`` and
  ``user → full name`` before shaping the DTOs.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
import structlog

from integration_service.adapters.base import (
    ConnectionStatus,
    DomainEvent,
    ImportResult,
    IntegrationAdapter,
    RemoteCourse,
    RemoteProblem,
    RemoteSubmission,
)
from integration_service.config import get_settings
from integration_service.services.oauth import get_access_token as _oauth_get_access_token

logger = structlog.get_logger(__name__)

# Stepik's list endpoints page at 20 by default; we cap how many submission
# pages we'll walk per step so one import call stays inside the gateway budget.
STEPIK_SUBMISSION_PAGE_CAP = 40
# `?ids[]=` batch size for steps / lessons / attempts / users lookups.
ID_BATCH = 30


async def _get_access_token(config: Any) -> Optional[str]:
    """Returns the access token for Stepik API calls.

    Lookup order:
      1. ``config.settings.static_token`` / ``access_token`` — tests & fixtures.
      2. Redis cache populated by the OAuth callback (``services/oauth.py``),
         keyed by ``oauth:token:{config.id}:access`` — the real path after a
         teacher completes the consent flow on stepik.org.
    """
    settings = getattr(config, "settings", None) or {}
    if isinstance(settings, dict):
        token = settings.get("static_token") or settings.get("access_token")
        if token:
            return str(token)
    config_id = getattr(config, "id", None)
    if not config_id:
        return None
    try:
        token = await _oauth_get_access_token(config_id)
    except Exception as exc:
        logger.warning(
            "stepik.get_access_token.redis_failed",
            config_id=config_id,
            error=str(exc),
        )
        return None
    return token


async def stepik_request(
    client: httpx.AsyncClient,
    token: Optional[str],
    method: str,
    path: str,
    *,
    params: Optional[dict[str, Any]] = None,
    base_url: Optional[str] = None,
) -> dict[str, Any]:
    """Single Stepik API call with bearer token (functional helper)."""
    s = get_settings()
    url = (base_url or s.stepik_api_base_url).rstrip("/") + "/" + path.lstrip("/")
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = await client.request(method, url, params=params, headers=headers)
    resp.raise_for_status()
    return resp.json()


async def fetch_submissions_page(
    client: httpx.AsyncClient,
    token: Optional[str],
    step_id: int,
    *,
    page: int = 1,
    time_gt: Optional[str] = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"step": step_id, "page": page}
    if time_gt:
        params["time__gt"] = time_gt
    return await stepik_request(client, token, "GET", "submissions", params=params)


# --------------------------------------------------------------------------- #
# language + filename helpers
# --------------------------------------------------------------------------- #
def normalize_stepik_language(raw: str | None) -> str | None:
    """Map a Stepik code-step language token (``python3``, ``c++``, ``java11``,
    ``haskell``, …) to a canonical hint the rest of PlagLens understands."""
    if not raw:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    if "pypy" in s or "python" in s or s.startswith("py"):
        return "python"
    if "kotlin" in s:
        return "kotlin"
    if "java" in s and "javascript" not in s and s != "js":
        return "java"
    if "c++" in s or s.startswith("cpp") or "g++" in s or "clang++" in s:
        return "cpp"
    if "c#" in s or "csharp" in s or "mono" in s:
        return "csharp"
    if "javascript" in s or s == "js" or "node" in s:
        return "javascript"
    if "typescript" in s or s == "ts":
        return "typescript"
    if "rust" in s:
        return "rust"
    if s == "go" or "golang" in s:
        return "go"
    if "haskell" in s:
        return "haskell"
    if "scala" in s:
        return "scala"
    if "sql" in s:
        return "sql"
    if "shell" in s or "bash" in s:
        return "shell"
    if "ruby" in s:
        return "ruby"
    if "php" in s:
        return "php"
    if s == "r":
        return "r"
    if s == "c" or s.startswith("gcc") or re.fullmatch(r"c\d*", s):
        return "c"
    return None


def _ext_for_language(lang: str | None) -> str:
    return {
        "python": "py", "cpp": "cpp", "c": "c", "java": "java", "kotlin": "kt",
        "javascript": "js", "typescript": "ts", "rust": "rs", "go": "go",
        "csharp": "cs", "haskell": "hs", "scala": "scala", "sql": "sql",
        "shell": "sh", "ruby": "rb", "php": "php", "r": "r",
    }.get(lang or "", "txt")


def _parse_time(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _chunks(items: list[Any], size: int) -> list[list[Any]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


_STEP_FETCH_CONCURRENCY = 8


async def fetch_steps(
    client: httpx.AsyncClient, token: Optional[str], step_ids: list[int]
) -> list[dict[str, Any]]:
    """Batch ``GET /api/steps?ids[]=…`` for the given step ids.

    Batches run concurrently (capped) — a big course is hundreds of steps,
    and fetching the batches one-at-a-time made the import dialog's tree load
    feel frozen for tens of seconds. The cap keeps us polite to Stepik.
    """
    batches = _chunks(step_ids, ID_BATCH)
    if not batches:
        return []
    sem = asyncio.Semaphore(_STEP_FETCH_CONCURRENCY)

    async def _one(batch: list[int]) -> list[dict[str, Any]]:
        async with sem:
            payload = await stepik_request(
                client, token, "GET", "steps", params={"ids[]": batch}
            )
            return payload.get("steps", []) or []

    out: list[dict[str, Any]] = []
    for chunk_steps in await asyncio.gather(*(_one(b) for b in batches)):
        out.extend(chunk_steps)
    return out


async def fetch_lesson_titles(
    client: httpx.AsyncClient, token: Optional[str], lesson_ids: list[int]
) -> dict[int, str]:
    titles: dict[int, str] = {}
    for batch in _chunks(lesson_ids, ID_BATCH):
        payload = await stepik_request(
            client, token, "GET", "lessons", params={"ids[]": batch}
        )
        for lesson in payload.get("lessons", []) or []:
            lid = lesson.get("id")
            if lid is not None:
                titles[int(lid)] = lesson.get("title") or ""
    return titles


async def fetch_attempt_users(
    client: httpx.AsyncClient,
    token: Optional[str],
    attempt_ids: list[int],
    step_id: int,
) -> dict[int, str]:
    """Resolve ``attempt_id → user_id``. Stepik attaches the learner to the
    attempt (not the submission), so the importer needs this hop."""
    out: dict[int, str] = {}
    for batch in _chunks(attempt_ids, ID_BATCH):
        try:
            payload = await stepik_request(
                client,
                token,
                "GET",
                "attempts",
                params={"ids[]": batch, "step": step_id},
            )
        except httpx.HTTPError as exc:
            logger.warning("stepik.fetch_attempts.failed", step_id=step_id, error=str(exc))
            continue
        for att in payload.get("attempts", []) or []:
            aid = att.get("id")
            uid = att.get("user")
            if aid is not None and uid is not None:
                out[int(aid)] = str(uid)
    return out


async def fetch_user_names(
    client: httpx.AsyncClient, token: Optional[str], user_ids: list[str]
) -> dict[str, str]:
    out: dict[str, str] = {}
    int_ids = [int(u) for u in user_ids if str(u).isdigit()]
    for batch in _chunks(int_ids, ID_BATCH):
        try:
            payload = await stepik_request(
                client, token, "GET", "users", params={"ids[]": batch}
            )
        except httpx.HTTPError as exc:
            logger.warning("stepik.fetch_users.failed", error=str(exc))
            continue
        for u in payload.get("users", []) or []:
            uid = u.get("id")
            if uid is None:
                continue
            name = (
                u.get("full_name")
                or f"{u.get('first_name', '') or ''} {u.get('last_name', '') or ''}".strip()
                or f"stepik-user-{uid}"
            )
            out[str(uid)] = name
    return out


class StepikAdapter(IntegrationAdapter):
    kind = "stepik"

    async def test_connection(self, config: Any) -> ConnectionStatus:
        token = await _get_access_token(config)
        if not token:
            return ConnectionStatus(ok=False, detail="No access token configured")
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            try:
                payload = await stepik_request(client, token, "GET", "stepics/1")
                return ConnectionStatus(ok=True, metadata={"sample": payload})
            except httpx.HTTPError as exc:
                return ConnectionStatus(ok=False, detail=f"HTTP error: {exc!s}")

    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]:
        settings = getattr(config, "settings", None) or {}
        course_ids: list[Any] = settings.get("stepik_course_ids", []) if isinstance(
            settings, dict
        ) else []
        token = await _get_access_token(config)
        out: list[RemoteCourse] = []
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            for cid in course_ids:
                try:
                    payload = await stepik_request(client, token, "GET", f"courses/{cid}")
                    items = payload.get("courses", [])
                    if items:
                        c = items[0]
                        out.append(
                            RemoteCourse(
                                external_id=str(c.get("id")),
                                title=c.get("title", str(cid)),
                                description=c.get("summary"),
                                extra={"sections": c.get("sections", [])},
                            )
                        )
                except httpx.HTTPError as exc:
                    logger.warning("stepik.list_courses.failed", course_id=cid, error=str(exc))
        return out

    async def import_problems(
        self, config: Any, scope: Dict[str, Any]
    ) -> ImportResult:
        """Turn the selected Stepik steps into ``RemoteProblem``s. ``scope``:
        ``{"step_ids": [int, ...], "stepik_course_id": int}``.

        Title is ``"<lesson title> · шаг <position>"`` (steps have no title of
        their own); statement is the step's ``block.text`` HTML. The language
        hint is left ``None`` and filled later from the dominant submission
        language (a step can sometimes accept several languages)."""
        token = await _get_access_token(config)
        raw_ids = scope.get("step_ids") or []
        step_ids = [int(s) for s in raw_ids if str(s).isdigit()]
        result = ImportResult()
        if not step_ids:
            result.failed = 1
            result.errors.append("scope.step_ids required")
            return result
        async with httpx.AsyncClient(
            timeout=get_settings().httpx_timeout_seconds
        ) as client:
            try:
                steps = await fetch_steps(client, token, step_ids)
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"steps fetch: {exc!s}")
                return result
            lesson_ids = sorted(
                {int(s["lesson"]) for s in steps if s.get("lesson") is not None}
            )
            lesson_titles: dict[int, str] = {}
            if lesson_ids:
                try:
                    lesson_titles = await fetch_lesson_titles(client, token, lesson_ids)
                except httpx.HTTPError:
                    lesson_titles = {}
        # Preserve the caller's requested order.
        by_id = {str(s.get("id")): s for s in steps}
        for idx, sid in enumerate(step_ids):
            st = by_id.get(str(sid))
            if not st:
                result.failed += 1
                result.errors.append(f"step {sid}: not found")
                continue
            block = st.get("block") or {}
            step_type = block.get("name") or "text"
            position = st.get("position")
            lesson_id = st.get("lesson")
            lesson_title = (
                lesson_titles.get(int(lesson_id)) if lesson_id is not None else None
            )
            if lesson_title and position is not None:
                title = f"{lesson_title} · шаг {position}"
            elif lesson_title:
                title = lesson_title
            elif position is not None:
                title = f"Шаг {position}"
            else:
                title = f"Задача {sid}"
            result.problems.append(
                RemoteProblem(
                    external_id=str(sid),
                    alias=str(sid),
                    title=title[:250],
                    position=position if isinstance(position, int) else idx,
                    statement_html=block.get("text") if isinstance(block.get("text"), str) else None,
                    language_hint=None,
                    extra={"step_type": step_type, "lesson_id": lesson_id},
                )
            )
        result.imported = len(result.problems)
        return result

    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult:
        """Pull every submission for one step and resolve each to an author +
        source. ``scope``: ``{"step_id": int, "max_pages"?: int}``."""
        token = await _get_access_token(config)
        step_id = scope.get("step_id") or scope.get("stepik_step_id")
        result = ImportResult()
        if step_id is None:
            result.failed = 1
            result.errors.append("scope.step_id required")
            return result
        max_pages = int(scope.get("max_pages") or STEPIK_SUBMISSION_PAGE_CAP)
        time_gt = since.isoformat() if since else None
        raw_subs: list[dict[str, Any]] = []
        async with httpx.AsyncClient(
            timeout=get_settings().httpx_timeout_seconds
        ) as client:
            page = 1
            while page <= max_pages:
                try:
                    payload = await fetch_submissions_page(
                        client, token, int(step_id), page=page, time_gt=time_gt
                    )
                except httpx.HTTPError as exc:
                    result.failed += 1
                    result.errors.append(f"step {step_id} page {page}: {exc!s}")
                    break
                items = payload.get("submissions", []) or []
                raw_subs.extend(items)
                meta = payload.get("meta", {})
                if not meta.get("has_next"):
                    break
                page += 1
                await asyncio.sleep(0.05)

            if not raw_subs:
                return result

            # attempt → user, then user → display name.
            attempt_ids = sorted(
                {int(s["attempt"]) for s in raw_subs if s.get("attempt") is not None}
            )
            attempt_user = await fetch_attempt_users(
                client, token, attempt_ids, int(step_id)
            )
            user_ids = sorted(set(attempt_user.values()))
            user_names = await fetch_user_names(client, token, user_ids)

        for s in raw_subs:
            sub_id = str(s.get("id"))
            attempt = s.get("attempt")
            uid = attempt_user.get(int(attempt)) if attempt is not None else None
            reply = s.get("reply") or {}
            code = reply.get("code") if isinstance(reply, dict) else None
            language = reply.get("language") if isinstance(reply, dict) else None
            if not code:
                # Non-code step: serialise the reply so it's still importable
                # (the teacher chose to include non-code steps).
                try:
                    code = json.dumps(reply, ensure_ascii=False, indent=2)
                except (TypeError, ValueError):
                    code = str(reply)
            score_raw = s.get("score")
            try:
                score = float(score_raw) if score_raw not in (None, "") else None
            except (TypeError, ValueError):
                score = None
            result.submissions.append(
                RemoteSubmission(
                    external_id=sub_id,
                    problem_id=str(step_id),
                    problem_alias=str(step_id),
                    external_user_id=str(uid) if uid else None,
                    login=user_names.get(str(uid)) if uid else None,
                    language=language,
                    source_code=code,
                    filename=(
                        f"submission-{sub_id}."
                        f"{_ext_for_language(normalize_stepik_language(language))}"
                    ),
                    submitted_at=_parse_time(s.get("time")),
                    verdict=s.get("status"),
                    score=score,
                )
            )
        result.imported = len(result.submissions)
        return result

    async def handle_webhook(
        self,
        payload: bytes,
        headers: Dict[str, str],
        config: Optional[Any] = None,
    ) -> List[DomainEvent]:
        # Stepik does not currently emit webhooks; left as no-op.
        return []
