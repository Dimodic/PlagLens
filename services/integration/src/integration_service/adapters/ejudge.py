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
)
from integration_service.config import get_settings

logger = structlog.get_logger(__name__)


def _settings(cfg: Any) -> dict[str, Any]:
    s = getattr(cfg, "settings", None) or {}
    return s if isinstance(s, dict) else {}


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
                result.imported = len(items)
                if items:
                    last = items[-1].get("run_id") or items[-1].get("id")
                    if last is not None:
                        result.cursor["max_run_id"] = last
            except httpx.HTTPError as exc:
                result.failed += 1
                result.errors.append(f"Network: {exc!s}")
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
