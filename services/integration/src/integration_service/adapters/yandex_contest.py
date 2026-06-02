"""Yandex.Contest adapter — real implementation backed by the public v2 API.

Endpoints used (all require the `contest:manage` OAuth scope):

  GET /api/public/v2/contests                              — list contests visible to the token owner
  GET /api/public/v2/contests/{id}                         — contest metadata
  GET /api/public/v2/contests/{id}/participants            — paginated participants list
  GET /api/public/v2/contests/{id}/submissions             — paginated submissions/runs

The OAuth token lives in Redis (set by services/oauth.py:store_tokens), keyed
by the `IntegrationConfig.id`. Each request rebuilds the token from there so
we automatically pick up refreshes.
"""
from __future__ import annotations

import asyncio
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
from integration_service.services.oauth import get_access_token

logger = structlog.get_logger(__name__)

# Yandex.Contest's public API serves at most this many items per page.
PAGE_SIZE = 200
# Max pages we'll walk before bailing out — guards against unexpected paginators.
MAX_PAGES = 50
# Cap for per-call submission ingestion. Each submission triggers a second
# GET for /full (source code), so at 0.1s per call 25 items ≈ 2.5s — well
# under the 30s gateway budget once you add the list-page call and
# downstream `identity` + `submission` writes.
MAX_PER_CALL = 25


class _YCError(RuntimeError):
    """Wraps an HTTP failure with a hint we can store on ImportResult."""

    def __init__(self, status: int, body: str) -> None:
        self.status = status
        self.body = body
        super().__init__(f"YC API {status}: {body[:240]}")


async def _token_for(config: Any) -> Optional[str]:
    """Fetch the access token for a given IntegrationConfig.

    Tokens are stored in Redis by the OAuth flow under
    ``oauth:token:{config_id}:access``. As a fallback for unit tests / manual
    seeding we also accept a token in ``config.settings.oauth_token``.
    """
    cid = getattr(config, "id", None)
    if cid:
        token = await get_access_token(str(cid))
        if token:
            return token
    settings = getattr(config, "settings", None) or {}
    if isinstance(settings, dict):
        return settings.get("oauth_token") or settings.get("access_token")
    return None


def _auth_headers(token: Optional[str]) -> Dict[str, str]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"OAuth {token}"
    return headers


async def yc_get(
    client: httpx.AsyncClient,
    token: Optional[str],
    path: str,
    *,
    params: Optional[dict[str, Any]] = None,
) -> Any:
    s = get_settings()
    url = s.yandex_contest_api_base_url.rstrip("/") + "/" + path.lstrip("/")
    resp = await client.get(url, params=params, headers=_auth_headers(token))
    if resp.status_code >= 400:
        raise _YCError(resp.status_code, resp.text)
    return resp.json()


async def _walk_pages(
    client: httpx.AsyncClient,
    token: Optional[str],
    path: str,
    *,
    items_key: str,
    extra_params: Optional[dict[str, Any]] = None,
) -> List[dict[str, Any]]:
    """Iterate page=1..N until we get fewer items than PAGE_SIZE or hit MAX_PAGES.

    Yandex.Contest's public v2 API uses Spring-style 1-indexed pagination:
    ``?pageSize=200&page=N`` (page=1 is the first page). When the response
    holds fewer items than PAGE_SIZE we stop. Some endpoints return a bare
    JSON array instead of a wrapper object — we handle both shapes.
    """
    out: list[dict[str, Any]] = []
    for page in range(1, MAX_PAGES + 1):
        params: dict[str, Any] = {"pageSize": PAGE_SIZE, "page": page}
        if extra_params:
            params.update(extra_params)
        payload = await yc_get(client, token, path, params=params)
        chunk: list[dict[str, Any]]
        if isinstance(payload, dict):
            chunk = payload.get(items_key, []) or []
        elif isinstance(payload, list):
            chunk = payload
        else:
            chunk = []
        out.extend(chunk)
        if len(chunk) < PAGE_SIZE:
            break
        # tiny pause to be polite to the API (5 RPS ceiling per token)
        await asyncio.sleep(0.05)
    return out


def _participant_role(raw: dict[str, Any]) -> str:
    """Map Yandex.Contest's participant flags to our internal role.

    The contest API returns participants as a flat list with possible flags
    `role`, `isJury`, `isAdmin`. Without those we treat the participant as a
    student (the typical case for contest entrants).
    """
    role = (raw.get("role") or "").lower()
    if role in {"admin", "owner", "teacher"}:
        return "teacher"
    if role in {"jury", "tutor", "assistant", "ta"}:
        return "assistant"
    if raw.get("isAdmin") or raw.get("isJury"):
        return "assistant"
    return "student"


def _to_remote_participant(raw: dict[str, Any]) -> RemoteParticipant:
    pid = str(raw.get("uid") or raw.get("id") or raw.get("login") or "")
    # The participant ``id`` is Y.Contest's per-contest numeric id —
    # the same field that lands as ``authorId``/``participantId`` on
    # each submission row. Preserve it separately so the submissions
    # importer can build a map participantId → login for stable
    # cross-contest user attribution.
    participant_id_raw = raw.get("id")
    participant_id = (
        str(participant_id_raw) if participant_id_raw is not None else None
    )
    return RemoteParticipant(
        external_id=pid,
        role=_participant_role(raw),
        login=raw.get("login"),
        name=raw.get("firstName") or raw.get("name"),
        surname=raw.get("lastName") or raw.get("surname"),
        email=raw.get("email"),
        participant_id=participant_id,
        extra={
            k: v
            for k, v in raw.items()
            if k not in {"uid", "id", "login", "firstName", "lastName", "name", "surname", "email"}
        },
    )


def _parse_submitted_at(raw: dict[str, Any]) -> Optional[datetime]:
    """Y.C. uses several timestamp field names depending on endpoint version."""
    for k in ("submissionTime", "submitTime", "submittedAt", "time", "createdAt"):
        v = raw.get(k)
        if not v:
            continue
        try:
            # API returns ISO 8601; tolerate `Z` suffix and offset variants.
            return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        except (TypeError, ValueError):
            continue
    return None


def _filename_for_language(language: Optional[str], submission_id: str) -> str:
    """Synthesise a filename for the source blob — drives MIME / syntax in the
    code viewer and gives a stable dedup-friendly path."""
    lang = (language or "").lower()
    ext = {
        "cpp": "cpp", "c++": "cpp", "g++": "cpp", "gcc": "c",
        "c": "c",
        "java": "java",
        "python": "py", "python3": "py", "py": "py", "pypy": "py",
        "javascript": "js", "js": "js", "node": "js",
        "kotlin": "kt",
        "go": "go",
        "rust": "rs",
        "csharp": "cs", "c#": "cs",
    }.get(lang, "txt")
    return f"submission-{submission_id}.{ext}"


def _to_remote_problem(raw: dict[str, Any], position: int) -> RemoteProblem:
    """Map a YC problem JSON node to ``RemoteProblem``.

    YC's schema varies a little between contests: the canonical fields are
    ``id`` (int), ``alias`` (letter), ``name`` (display title), and
    ``statement`` (rendered HTML). Older / migrated contests sometimes use
    ``title`` instead of ``name`` and ``problemId`` instead of ``id`` — we
    fall back through both.
    """
    ext_id = raw.get("id") or raw.get("problemId") or raw.get("alias") or ""
    alias = raw.get("alias")
    title = raw.get("name") or raw.get("title") or (alias or "Problem")
    if alias:
        title_with_letter = f"{alias}. {title}" if str(title).strip() != str(alias).strip() else str(title)
    else:
        title_with_letter = str(title)
    time_limit_ms: Optional[int] = None
    raw_time = raw.get("timeLimit") or raw.get("time_limit")
    if isinstance(raw_time, int | float):
        # YC reports seconds; convert to ms for downstream uniformity.
        time_limit_ms = int(raw_time * 1000) if raw_time < 100 else int(raw_time)
    memory_limit_bytes: Optional[int] = None
    raw_mem = raw.get("memoryLimit") or raw.get("memory_limit")
    if isinstance(raw_mem, int | float):
        memory_limit_bytes = int(raw_mem)
    statement_html = raw.get("statement") or raw.get("statementHtml")
    return RemoteProblem(
        external_id=str(ext_id),
        alias=str(alias) if alias is not None else None,
        title=title_with_letter,
        position=position,
        statement_html=statement_html if isinstance(statement_html, str) else None,
        time_limit_ms=time_limit_ms,
        memory_limit_bytes=memory_limit_bytes,
        extra={k: v for k, v in raw.items() if k not in {
            "id", "problemId", "alias", "name", "title", "statement",
            "statementHtml", "timeLimit", "time_limit", "memoryLimit",
            "memory_limit",
        }},
    )


def _to_remote_submission(raw: dict[str, Any]) -> RemoteSubmission:
    """Map a Yandex.Contest submission/run dict into our DTO.

    Field names vary across endpoints — we try both camelCase + snake_case.
    Source code is rarely returned in the list endpoint; the adapter does a
    second-pass fetch per id (see import_submissions).
    """
    sub_id = str(
        raw.get("id") or raw.get("runId") or raw.get("submissionId") or ""
    )
    return RemoteSubmission(
        external_id=sub_id,
        problem_id=str(raw.get("problemId") or raw.get("problem_id") or "") or None,
        problem_alias=raw.get("problemAlias") or raw.get("problem") or raw.get("problemTitle"),
        external_user_id=str(
            raw.get("uid") or raw.get("authorId") or raw.get("participantId") or ""
        ) or None,
        # Public YC list endpoint returns the participant display name in
        # ``author`` (e.g. "Петров Александр Сергеевич"); the actual yandex
        # login isn't exposed. Fall back to that so downstream attribution +
        # display have something human-readable.
        login=(
            raw.get("login")
            or raw.get("authorLogin")
            or raw.get("participantLogin")
            or raw.get("author")
        ),
        language=raw.get("language") or raw.get("compiler") or raw.get("languageId"),
        source_code=raw.get("source") or raw.get("sourceCode"),
        filename=None,  # filled in after we know language + id
        submitted_at=_parse_submitted_at(raw),
        verdict=raw.get("verdict") or raw.get("status"),
        score=(
            float(raw.get("score"))
            if raw.get("score") is not None
            else float(raw.get("scoreInPercents"))
            if raw.get("scoreInPercents") is not None
            else None
        ),
        extra={
            k: v
            for k, v in raw.items()
            if k
            not in {
                "id", "runId", "submissionId", "problemId", "problem_id",
                "problemAlias", "problem", "problemTitle", "uid", "authorId",
                "participantId", "login", "authorLogin", "participantLogin",
                "author",
                "language", "compiler", "languageId", "source", "sourceCode",
                "submissionTime", "submitTime", "submittedAt", "time", "createdAt",
                "verdict", "status", "score", "scoreInPercents",
            }
        },
    )


async def _fetch_submission_source(
    client: httpx.AsyncClient,
    token: Optional[str],
    contest_id: Any,
    submission_id: str,
) -> Optional[str]:
    """Two endpoints Y.C. has historically exposed for source:
        GET /contests/{cid}/submissions/{sid}/source
        GET /contests/{cid}/submissions/{sid}     (with includeSource)
    We try both before giving up.
    """
    # /source returns raw text but yields 406 against our default
    # `Accept: application/json` header. /full is a JSON wrapper containing
    # the source plus metadata — exactly what we need. We use /full only.
    try:
        payload = await yc_get(client, token, f"contests/{contest_id}/submissions/{submission_id}/full")
    except _YCError:
        return None
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        for k in ("source", "sourceCode", "code", "text"):
            if payload.get(k):
                return str(payload[k])
    return None


class YandexContestAdapter(IntegrationAdapter):
    kind = "yandex_contest"

    async def test_connection(self, config: Any) -> ConnectionStatus:
        token = await _token_for(config)
        if not token:
            return ConnectionStatus(ok=False, detail="No OAuth token. Connect first via /oauth/start.")
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            try:
                # Y.C. public API has no list-of-contests endpoint — we probe
                # `service/introspect` which echoes the authenticated principal
                # if the token is valid (cheap, no contest scope needed).
                payload = await yc_get(client, token, "service/introspect")
                detail = "Token valid"
                if isinstance(payload, dict):
                    login = payload.get("login") or payload.get("uid")
                    if login:
                        detail = f"Token valid, principal={login}"
                return ConnectionStatus(ok=True, detail=detail, metadata=payload if isinstance(payload, dict) else {})
            except _YCError as exc:
                return ConnectionStatus(
                    ok=False, detail=f"YC API responded {exc.status}: {exc.body[:160]}"
                )
            except httpx.HTTPError as exc:
                return ConnectionStatus(ok=False, detail=f"Network: {exc!s}")

    async def list_remote_courses(self, config: Any) -> List[RemoteCourse]:
        """Y.C. public API has no "list all contests" endpoint — the only way
        to enumerate is via ``cfg.settings.contest_ids`` (admin-supplied) or
        by reading ``cfg.cursor`` for known ids. We fetch each one by id."""
        token = await _token_for(config)
        out: list[RemoteCourse] = []
        ids: list[Any] = []
        settings = getattr(config, "settings", None) or {}
        if isinstance(settings, dict):
            raw_ids = settings.get("contest_ids")
            if isinstance(raw_ids, list):
                ids = list(raw_ids)
            cid = settings.get("contest_id")
            if cid is not None and cid not in ids:
                ids.append(cid)
        if not ids:
            return out
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            for cid in ids:
                try:
                    c = await yc_get(client, token, f"contests/{cid}")
                    if not isinstance(c, dict):
                        continue
                    out.append(
                        RemoteCourse(
                            external_id=str(c.get("id") or cid),
                            title=c.get("name") or c.get("title") or "Unknown contest",
                            description=c.get("description"),
                            extra={
                                "startTime": c.get("startTime"),
                                "endTime": c.get("endTime"),
                                "duration": c.get("duration"),
                            },
                        )
                    )
                except (_YCError, httpx.HTTPError) as exc:
                    logger.warning("yandex_contest.fetch_failed", contest_id=cid, error=str(exc))
        return out

    async def import_participants(
        self, config: Any, scope: Dict[str, Any]
    ) -> ImportResult:
        token = await _token_for(config)
        contest_id = scope.get("contest_id")
        result = ImportResult()
        if contest_id is None:
            result.failed = 1
            result.errors.append("scope.contest_id required")
            return result
        if not token:
            result.failed = 1
            result.errors.append("no OAuth token; connect first")
            return result
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            try:
                items = await _walk_pages(
                    client,
                    token,
                    f"contests/{contest_id}/participants",
                    items_key="participants",
                )
                result.participants = [_to_remote_participant(it) for it in items]
                result.imported = len(result.participants)
            except _YCError as exc:
                result.failed += 1
                result.errors.append(f"YC API {exc.status}: {exc.body[:200]}")
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
        token = await _token_for(config)
        contest_id = scope.get("contest_id")
        result = ImportResult()
        if contest_id is None:
            result.failed = 1
            result.errors.append("scope.contest_id required")
            return result
        if not token:
            result.failed = 1
            result.errors.append("no OAuth token; connect first")
            return result
        # If callers track an incremental cursor we honour both shapes:
        # ``scope.cursor.max_run_id`` (legacy ``fromId`` filter) and the
        # simpler ``scope.page`` (1-indexed). Page-based pagination is the
        # reliable knob for bulk pulls — YC's ``fromId`` doesn't always
        # advance the way we expect.
        params: dict[str, Any] = {}
        cursor = (scope.get("cursor") or {}).get("max_run_id")
        if cursor:
            params["fromId"] = cursor
        if since:
            params["fromTime"] = since.isoformat()
        page_num = int(scope.get("page") or 1)
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            try:
                # Cap per-call ingestion: fetch ONE page with a bounded
                # page-size. Each item still triggers a /full GET (~100 ms),
                # so each ~100-item page costs ~10 s.
                limit = int(scope.get("limit") or MAX_PER_CALL)
                page_params: dict[str, Any] = {
                    "pageSize": limit,
                    "page": page_num,
                    **(params or {}),
                }
                payload = await yc_get(
                    client,
                    token,
                    f"contests/{contest_id}/submissions",
                    params=page_params,
                )
                if isinstance(payload, dict):
                    items = payload.get("submissions", []) or []
                elif isinstance(payload, list):
                    items = payload
                else:
                    items = []
                items = items[:limit]
                # Pass 1: structural mapping (no source code yet)
                remote_subs: list[RemoteSubmission] = [_to_remote_submission(it) for it in items]
                # Pass 2: backfill source for any submission whose list-payload
                # didn't already carry it. Y.C. usually requires a per-id GET.
                missing_source = [s for s in remote_subs if not s.source_code]
                if missing_source and not scope.get("skip_source_fetch"):
                    # Sequential per-id GETs at 0.1 s spacing were too slow
                    # on real contests (1k+ submissions = several minutes).
                    # Fan-out with a small concurrency pool — /full is
                    # read-only and YC's per-token soft limit (~5 RPS) is
                    # forgiving for short bursts of read traffic.
                    concurrency = int(scope.get("source_concurrency") or 8)
                    sem = asyncio.Semaphore(concurrency)

                    async def _fill(s: RemoteSubmission) -> None:
                        async with sem:
                            src = await _fetch_submission_source(
                                client, token, contest_id, s.external_id
                            )
                            if src is not None:
                                s.source_code = src

                    await asyncio.gather(*(_fill(s) for s in missing_source))
                # Pass 3: name each blob now that we know language + id
                for s in remote_subs:
                    s.filename = _filename_for_language(s.language, s.external_id)
                result.submissions = remote_subs
                result.imported = len(remote_subs)
                if items:
                    last_id = items[-1].get("id") or items[-1].get("runId")
                    if last_id is not None:
                        result.cursor["max_run_id"] = last_id
            except _YCError as exc:
                result.failed += 1
                result.errors.append(f"YC API {exc.status}: {exc.body[:200]}")
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"Network: {exc!s}")
        return result

    async def import_problems(
        self, config: Any, scope: Dict[str, Any]
    ) -> ImportResult:
        """Fetch the problems (tasks) of a single contest.

        Endpoint: ``GET /api/public/v2/contests/{contest_id}/problems``. Y.C.
        responds either with a bare array of problems or with
        ``{"problems": [...]}`` depending on the schema version — we handle
        both. Each problem in the response carries at least ``id`` /
        ``alias`` / ``name``; ``statement`` (rendered HTML), ``timeLimit``
        (seconds) and ``memoryLimit`` (bytes) are populated when the contest
        exposes them.
        """
        token = await _token_for(config)
        contest_id = scope.get("contest_id")
        result = ImportResult()
        if contest_id is None:
            result.failed = 1
            result.errors.append("scope.contest_id required")
            return result
        if not token:
            result.failed = 1
            result.errors.append("no OAuth token; connect first")
            return result

        async with httpx.AsyncClient(
            timeout=get_settings().httpx_timeout_seconds
        ) as client:
            try:
                payload = await yc_get(
                    client, token, f"contests/{contest_id}/problems"
                )
            except _YCError as exc:
                result.failed += 1
                result.errors.append(f"YC API {exc.status}: {exc.body[:200]}")
                return result
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"Network: {exc!s}")
                return result

        raw_list: list[dict[str, Any]]
        if isinstance(payload, dict):
            raw_list = payload.get("problems", []) or []
        elif isinstance(payload, list):
            raw_list = payload
        else:
            raw_list = []

        # Pull each problem's rendered statement in parallel. YC's public
        # v2 API documents this as ``GET /contests/{id}/problems/{alias}/
        # statement`` (Swagger: "Get problem statement", requires OAuth
        # scope ``submit`` or ``manage``). Default format is HTML; we
        # explicitly pass ``locale=ru`` so condition text matches the UI.
        # Best-effort: if the call fails (token missing scope, 404 etc.)
        # we just keep the problem without statement_html — caller will
        # fall back to a "see on YC" link.
        sem = asyncio.Semaphore(8)

        async def _fetch_statement(alias: str | None) -> Optional[str]:
            if not alias:
                return None
            async with sem, httpx.AsyncClient(
                timeout=get_settings().httpx_timeout_seconds
            ) as detail_client:
                url = (
                    get_settings().yandex_contest_api_base_url.rstrip("/")
                    + f"/contests/{contest_id}/problems/{alias}/statement"
                )
                # YC declares the endpoint as ``produces:
                # application/octet-stream`` — sending the default
                # ``Accept: application/json`` (from _auth_headers)
                # gets a 406. Override it so the server gives us the
                # rendered HTML bytes.
                base_headers = _auth_headers(token)
                base_headers["Accept"] = "application/octet-stream"
                try:
                    resp = await detail_client.get(
                        url,
                        params={"locale": "ru"},
                        headers=base_headers,
                    )
                except httpx.HTTPError:
                    return None
            if resp.status_code != 200:
                return None
            try:
                return resp.content.decode("utf-8", errors="replace")
            except Exception:  # noqa: BLE001
                return None

        async def _enrich(raw: dict[str, Any]) -> dict[str, Any]:
            alias = raw.get("alias")
            stmt = await _fetch_statement(str(alias) if alias else None)
            if stmt:
                # Don't clobber a statement that the list endpoint
                # happened to include — but in practice the list never
                # carries one, so this branch always wins.
                merged = {**raw}
                if not merged.get("statement"):
                    merged["statement"] = stmt
                return merged
            return raw

        enriched = await asyncio.gather(
            *(_enrich(r) for r in raw_list if isinstance(r, dict))
        )

        for idx, raw in enumerate(enriched):
            if not isinstance(raw, dict):
                continue
            result.problems.append(_to_remote_problem(raw, idx))
        result.imported = len(result.problems)
        return result

    async def fetch_contest_name(
        self, config: Any, contest_id: Any
    ) -> Optional[str]:
        """Best-effort contest display name for UI hints (e.g. the import
        dialog's title placeholder). Never raises — returns None on any error.
        """
        token = await _token_for(config)
        if not token:
            return None
        try:
            async with httpx.AsyncClient(
                timeout=get_settings().httpx_timeout_seconds
            ) as client:
                payload = await yc_get(client, token, f"contests/{contest_id}")
        except Exception:  # noqa: BLE001 — purely cosmetic, never fatal
            return None
        if isinstance(payload, dict):
            name = payload.get("name") or payload.get("title")
            return str(name) if name else None
        return None

    async def handle_webhook(
        self,
        payload: bytes,
        headers: Dict[str, str],
        config: Optional[Any] = None,
    ) -> List[DomainEvent]:
        # Yandex.Contest does not push webhooks — this is a no-op kept for
        # adapter symmetry. We rely on scheduled polling via import_submissions.
        _ = (payload, headers, config)
        return []
