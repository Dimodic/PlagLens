"""Stepik adapter — OAuth + httpx polling of `/api/submissions`."""
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
)
from integration_service.config import get_settings
from integration_service.services.oauth import get_access_token as _oauth_get_access_token

logger = structlog.get_logger(__name__)


async def _get_access_token(config: Any) -> Optional[str]:
    """Returns the access token for Stepik API calls.

    Lookup order:
      1. `config.settings.static_token` / `access_token` — used by tests &
         fixtures so adapter logic can run without Redis.
      2. Redis cache populated by the OAuth callback (`services/oauth.py`),
         keyed by ``oauth:token:{config.id}:access``. This is the real path
         after a teacher completes the consent flow on stepik.org.
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

    async def import_submissions(
        self,
        config: Any,
        scope: Dict[str, Any],
        since: Optional[datetime],
    ) -> ImportResult:
        token = await _get_access_token(config)
        time_gt = since.isoformat() if since else None
        step_id = scope.get("step_id") or scope.get("stepik_step_id")
        if step_id is None:
            return ImportResult(failed=1, errors=["scope.step_id required"])
        result = ImportResult()
        async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
            page = 1
            while True:
                try:
                    payload = await fetch_submissions_page(
                        client, token, int(step_id), page=page, time_gt=time_gt
                    )
                except httpx.HTTPError as exc:
                    result.failed += 1
                    result.errors.append(f"page {page}: {exc!s}")
                    break
                items = payload.get("submissions", [])
                result.imported += len(items)
                meta = payload.get("meta", {})
                if not meta.get("has_next"):
                    if items:
                        last_time = items[-1].get("time")
                        if last_time:
                            result.cursor["last_imported_at"] = last_time
                    break
                page += 1
        return result

    async def handle_webhook(
        self,
        payload: bytes,
        headers: Dict[str, str],
        config: Optional[Any] = None,
    ) -> List[DomainEvent]:
        # Stepik does not currently emit webhooks; left as no-op.
        return []
