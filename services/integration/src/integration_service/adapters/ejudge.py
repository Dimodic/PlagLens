"""eJudge adapter — REST client for eJudge instances that expose
`/api/v1/contests/.../users` (newer eJudge ≥ 3.10) over HTTP+API token.

The older XML-RPC interface (`/cgi-bin/serve-control`) is intentionally not
supported here — those installs require session-cookie auth and are scraped
rather than queried. This adapter targets the modern REST surface only.

Configuration lives in IntegrationConfig.settings:
  - adapter:     "ejudge" (sentinel — see api/v1/configs.py)
  - base_url:    https://ejudge.example.org
  - api_key:     personal access token (Authorization: Bearer)
  - contest_ids: list[int]  — eJudge contest IDs to scan
"""
from __future__ import annotations

import asyncio
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
    RemoteParticipant,
    RemoteProblem,
    RemoteSubmission,
)
from integration_service.config import get_settings

logger = structlog.get_logger(__name__)

# Cap per-call run ingestion: each run triggers a second GET for its source,
# so a large contest is paged across several import calls by the orchestrator.
MAX_RUNS_PER_CALL = 60


def _settings(cfg: Any) -> dict[str, Any]:
    s = getattr(cfg, "settings", None) or {}
    return s if isinstance(s, dict) else {}


def normalize_ejudge_language(raw: str | None) -> str | None:
    """Map an eJudge compiler/lang short name to a canonical hint."""
    if not raw:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    if "python" in s or s.startswith("py") or "pypy" in s:
        return "python"
    if "g++" in s or "clang++" in s or "c++" in s or s.startswith("gpp") or "msvc" in s:
        return "cpp"
    if "java" in s and "javascript" not in s:
        return "java"
    if "kotlin" in s or s.startswith("kt"):
        return "kotlin"
    if "mono" in s or "csharp" in s or "c#" in s or "dotnet" in s:
        return "csharp"
    if "node" in s or "javascript" in s or s == "js":
        return "javascript"
    if "rust" in s:
        return "rust"
    if s == "go" or "golang" in s:
        return "go"
    if "pas" in s or "fpc" in s or "delphi" in s:
        return "pascal"
    if "haskell" in s or s.startswith("ghc"):
        return "haskell"
    if s == "c" or s.startswith("gcc") or re.fullmatch(r"c\d*", s):
        return "c"
    return None


def _ext_for_language(lang: str | None) -> str:
    return {
        "python": "py", "cpp": "cpp", "c": "c", "java": "java", "kotlin": "kt",
        "javascript": "js", "rust": "rs", "go": "go", "csharp": "cs",
        "pascal": "pas", "haskell": "hs",
    }.get(lang or "", "txt")


def _parse_time(raw: Any) -> Optional[datetime]:
    if not raw:
        return None
    # eJudge sometimes returns a unix epoch (int) and sometimes ISO 8601.
    if isinstance(raw, (int, float)):
        try:
            return datetime.utcfromtimestamp(float(raw))
        except (ValueError, OSError, OverflowError):
            return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _client(cfg: Any) -> Optional[httpx.AsyncClient]:
    settings = _settings(cfg)
    base = (settings.get("base_url") or "").rstrip("/")
    token = settings.get("api_key")
    if not base or not token:
        return None
    return httpx.AsyncClient(
        base_url=base,
        timeout=get_settings().httpx_timeout_seconds,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )


def _to_remote_participant(raw: dict[str, Any]) -> RemoteParticipant:
    """eJudge user payload shape — best-effort mapping. Different installs
    rename fields, so we accept several aliases."""
    pid = str(
        raw.get("user_id")
        or raw.get("id")
        or raw.get("login")
        or ""
    )
    return RemoteParticipant(
        external_id=pid,
        role="student",
        login=raw.get("login") or raw.get("user_login"),
        name=raw.get("first_name") or raw.get("name"),
        surname=raw.get("last_name") or raw.get("family"),
        email=raw.get("email"),
        extra={
            k: v
            for k, v in raw.items()
            if k not in {"user_id", "id", "login", "user_login",
                         "first_name", "last_name", "name", "family", "email"}
        },
    )


def _to_remote_submission(raw: dict[str, Any]) -> RemoteSubmission:
    """Map an eJudge run row into our DTO. Field names vary across installs —
    we accept several aliases."""
    rid = str(raw.get("run_id") or raw.get("id") or "")
    uid = raw.get("user_id") if raw.get("user_id") is not None else raw.get("user")
    name = (
        raw.get("user_name")
        or raw.get("name")
        or raw.get("user_login")
        or raw.get("login")
    )
    score_raw = raw.get("score")
    try:
        score = float(score_raw) if score_raw not in (None, "") else None
    except (TypeError, ValueError):
        score = None
    return RemoteSubmission(
        external_id=rid,
        problem_id=str(
            raw.get("prob_id") or raw.get("problem_id") or raw.get("problem") or ""
        )
        or None,
        problem_alias=str(
            raw.get("prob_short")
            or raw.get("problem_short")
            or raw.get("short_name")
            or raw.get("problem")
            or ""
        )
        or None,
        external_user_id=str(uid) if uid is not None else None,
        login=name or (str(uid) if uid is not None else None),
        language=raw.get("lang") or raw.get("lang_short") or raw.get("language"),
        source_code=raw.get("source") or raw.get("source_code"),
        filename=None,
        submitted_at=_parse_time(
            raw.get("create_time") or raw.get("time") or raw.get("run_time")
        ),
        verdict=raw.get("status") or raw.get("verdict"),
        score=score,
    )


async def _fetch_run_source(
    client: httpx.AsyncClient, contest_id: Any, run_id: str
) -> Optional[str]:
    """Pull one run's source. eJudge serves either raw text or a JSON wrapper
    depending on version — handle both."""
    try:
        resp = await client.get(f"/api/v1/contests/{contest_id}/runs/{run_id}/source")
    except httpx.HTTPError:
        return None
    if resp.status_code >= 400:
        return None
    ctype = resp.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            body = resp.json()
        except ValueError:
            return resp.text or None
        if isinstance(body, str):
            return body
        if isinstance(body, dict):
            for k in ("source", "source_code", "text", "code"):
                if body.get(k):
                    return str(body[k])
        return None
    return resp.text or None


def _to_remote_problem(raw: dict[str, Any], position: int) -> RemoteProblem:
    ext_id = raw.get("id") or raw.get("prob_id") or raw.get("short_name") or ""
    short = raw.get("short_name") or raw.get("short") or raw.get("prob_short")
    title = (
        raw.get("long_name")
        or raw.get("name")
        or raw.get("title")
        or short
        or f"Problem {ext_id}"
    )
    if short and str(title).strip() != str(short).strip():
        display = f"{short}. {title}"
    else:
        display = str(title)
    statement = raw.get("statement") or raw.get("statement_html")
    return RemoteProblem(
        external_id=str(ext_id),
        alias=str(short) if short else str(ext_id),
        title=display[:250],
        position=position,
        statement_html=statement if isinstance(statement, str) else None,
    )


class EjudgeAdapter(IntegrationAdapter):
    kind = "ejudge"

    async def test_connection(self, config: Any) -> ConnectionStatus:
        client = _client(config)
        if client is None:
            return ConnectionStatus(
                ok=False,
                detail="settings.base_url and settings.api_key are required",
            )
        async with client:
            try:
                # Cheap probe — every modern eJudge has a status endpoint.
                resp = await client.get("/api/v1/status")
                if resp.status_code == 404:
                    # Fallback for installs that expose it elsewhere.
                    resp = await client.get("/")
                if resp.status_code >= 400:
                    return ConnectionStatus(
                        ok=False,
                        detail=f"eJudge {resp.status_code}: {resp.text[:160]}",
                    )
                return ConnectionStatus(ok=True, detail="API reachable")
            except httpx.HTTPError as exc:
                return ConnectionStatus(ok=False, detail=f"Network: {exc!s}")

    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]:
        """eJudge doesn't have 'courses' in its model — every contest stands
        alone. We expose configured contest_ids as `RemoteCourse` rows so the
        integration UI can render them as picker entries."""
        settings = _settings(config)
        ids = settings.get("contest_ids") or []
        if not isinstance(ids, list):
            return []
        client = _client(config)
        if client is None:
            return [
                RemoteCourse(external_id=str(cid), title=f"eJudge contest {cid}")
                for cid in ids
            ]
        out: list[RemoteCourse] = []
        async with client:
            for cid in ids:
                try:
                    resp = await client.get(f"/api/v1/contests/{cid}")
                    if resp.status_code == 200:
                        body = resp.json()
                        title = body.get("name") or body.get("title") or f"contest {cid}"
                        out.append(RemoteCourse(external_id=str(cid), title=title))
                    else:
                        out.append(
                            RemoteCourse(
                                external_id=str(cid),
                                title=f"eJudge contest {cid} (HTTP {resp.status_code})",
                            )
                        )
                except httpx.HTTPError as exc:
                    logger.warning(
                        "ejudge.list_failed", contest_id=cid, error=str(exc)
                    )
                    out.append(
                        RemoteCourse(
                            external_id=str(cid),
                            title=f"eJudge contest {cid} (unreachable)",
                        )
                    )
        return out

    async def import_participants(
        self, config: Any, scope: Dict[str, Any]
    ) -> ImportResult:
        result = ImportResult()
        client = _client(config)
        if client is None:
            result.failed = 1
            result.errors.append("settings.base_url / settings.api_key missing")
            return result
        contest_id = scope.get("contest_id")
        if contest_id is None:
            result.failed = 1
            result.errors.append("scope.contest_id required")
            return result
        async with client:
            try:
                resp = await client.get(f"/api/v1/contests/{contest_id}/users")
                if resp.status_code >= 400:
                    result.failed += 1
                    result.errors.append(
                        f"eJudge {resp.status_code}: {resp.text[:200]}"
                    )
                    return result
                data = resp.json()
                items = data.get("users") if isinstance(data, dict) else data
                if not isinstance(items, list):
                    result.failed += 1
                    result.errors.append("unexpected payload shape")
                    return result
                result.participants = [_to_remote_participant(it) for it in items]
                result.imported = len(result.participants)
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"Network: {exc!s}")
        return result

    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult:
        result = ImportResult()
        client = _client(config)
        if client is None:
            result.failed = 1
            result.errors.append("settings.base_url / settings.api_key missing")
            return result
        contest_id = scope.get("contest_id")
        if contest_id is None:
            result.failed = 1
            result.errors.append("scope.contest_id required")
            return result
        cursor = (scope.get("cursor") or {}).get("max_run_id")
        params: dict[str, Any] = {}
        if cursor:
            params["from_run_id"] = cursor
        # Optional per-problem filter (the orchestrator imports one problem at
        # a time so it can attribute each run to the right assignment).
        if scope.get("problem") is not None:
            params["problem"] = scope.get("problem")
        limit = int(scope.get("limit") or MAX_RUNS_PER_CALL)
        async with client:
            try:
                resp = await client.get(
                    f"/api/v1/contests/{contest_id}/runs", params=params
                )
                if resp.status_code >= 400:
                    result.failed += 1
                    result.errors.append(
                        f"eJudge {resp.status_code}: {resp.text[:200]}"
                    )
                    return result
                data = resp.json()
                items = data.get("runs") if isinstance(data, dict) else data
                if not isinstance(items, list):
                    result.failed += 1
                    result.errors.append("unexpected payload shape")
                    return result
                items = items[:limit]
                subs = [_to_remote_submission(it) for it in items]
                # Backfill source per run (bounded concurrency) — eJudge keeps
                # the code behind a separate per-run endpoint.
                if not scope.get("skip_source_fetch"):
                    sem = asyncio.Semaphore(int(scope.get("source_concurrency") or 8))

                    async def _fill(rs: RemoteSubmission) -> None:
                        async with sem:
                            src = await _fetch_run_source(
                                client, contest_id, rs.external_id
                            )
                            if src is not None:
                                rs.source_code = src

                    await asyncio.gather(
                        *(_fill(rs) for rs in subs if not rs.source_code)
                    )
                for rs in subs:
                    rs.filename = (
                        f"submission-{rs.external_id}."
                        f"{_ext_for_language(normalize_ejudge_language(rs.language))}"
                    )
                result.submissions = subs
                result.imported = len(subs)
                if items:
                    last = items[-1].get("run_id") or items[-1].get("id")
                    if last is not None:
                        result.cursor["max_run_id"] = last
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"Network: {exc!s}")
        return result

    async def import_problems(
        self, config: Any, scope: Dict[str, Any]
    ) -> ImportResult:
        """Fetch a contest's problems → ``RemoteProblem`` list."""
        result = ImportResult()
        client = _client(config)
        if client is None:
            result.failed = 1
            result.errors.append("settings.base_url / settings.api_key missing")
            return result
        contest_id = scope.get("contest_id")
        if contest_id is None:
            result.failed = 1
            result.errors.append("scope.contest_id required")
            return result
        async with client:
            try:
                resp = await client.get(f"/api/v1/contests/{contest_id}/problems")
                if resp.status_code >= 400:
                    result.failed += 1
                    result.errors.append(
                        f"eJudge {resp.status_code}: {resp.text[:200]}"
                    )
                    return result
                data = resp.json()
                items = data.get("problems") if isinstance(data, dict) else data
                if not isinstance(items, list):
                    result.failed += 1
                    result.errors.append("unexpected payload shape")
                    return result
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"Network: {exc!s}")
                return result
        for idx, raw in enumerate(items):
            if isinstance(raw, dict):
                result.problems.append(_to_remote_problem(raw, idx))
        result.imported = len(result.problems)
        return result

    async def handle_webhook(
        self,
        payload: bytes,
        headers: Dict[str, str],
        config: Optional[Any] = None,
    ) -> List[DomainEvent]:
        # eJudge does not push webhooks — we rely on scheduler polling.
        _ = (payload, headers, config)
        return []
