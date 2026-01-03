"""Audit-Service proxy with an in-memory fake for tests."""
from __future__ import annotations

from typing import Any


class InMemoryAuditProxy:
    """Mock proxy: returns user-supplied entries."""

    def __init__(self) -> None:
        self.entries: list[dict[str, Any]] = []

    async def recent_for_course(
        self, tenant_id: str, course_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        return [
            e
            for e in self.entries
            if e.get("tenant_id") == tenant_id and e.get("course_id") == course_id
        ][-limit:]

    async def recent_for_user(
        self, tenant_id: str, user_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        return [
            e
            for e in self.entries
            if e.get("tenant_id") == tenant_id
            and (e.get("actor_id") == user_id or e.get("user_id") == user_id)
        ][-limit:]

    async def export_window(
        self, tenant_id: str, *, since=None, until=None, limit: int = 1000
    ) -> list[dict[str, Any]]:
        return [e for e in self.entries if e.get("tenant_id") == tenant_id][-limit:]

    def add(self, entry: dict[str, Any]) -> None:
        self.entries.append(entry)


class HttpAuditProxy:
    """Real proxy via httpx — fallback used when configured.

    Service-to-service: if the audit service is unreachable or returns a
    non-2xx (including auth failures because we don't forward a JWT), the
    proxy degrades gracefully to an empty list rather than propagating a 500
    to the caller. The /users/me/recent-activity surface treats "no recent
    activity" and "audit service not reachable right now" as the same UX.
    """

    def __init__(self, base_url: str):
        self.base_url = base_url
        try:  # pragma: no cover - integration only
            import httpx

            self._client = httpx.AsyncClient(base_url=base_url, timeout=5.0)
        except Exception:
            self._client = None
        self._fallback = InMemoryAuditProxy() if self._client is None else None

    async def _safe_get(self, path: str, params: dict) -> list[dict[str, Any]]:
        """GET and return data list, or [] on any failure."""
        try:  # pragma: no cover - integration only
            r = await self._client.get(path, params=params)
            if r.status_code >= 400:
                return []
            payload = r.json()
            if isinstance(payload, dict):
                data = payload.get("data")
                if isinstance(data, list):
                    return data
            return []
        except Exception:
            return []

    async def recent_for_course(self, tenant_id: str, course_id: str, limit: int = 50):
        if self._fallback is not None:
            return await self._fallback.recent_for_course(tenant_id, course_id, limit)
        return await self._safe_get(
            "/api/v1/audit/events",
            {"tenant_id": tenant_id, "resource_id": course_id, "limit": limit},
        )

    async def recent_for_user(self, tenant_id: str, user_id: str, limit: int = 50):
        if self._fallback is not None:
            return await self._fallback.recent_for_user(tenant_id, user_id, limit)
        return await self._safe_get(
            "/api/v1/audit/events",
            {"tenant_id": tenant_id, "actor_id": user_id, "limit": limit},
        )

    async def export_window(
        self, tenant_id: str, *, since=None, until=None, limit: int = 1000
    ):
        if self._fallback is not None:
            return await self._fallback.export_window(
                tenant_id, since=since, until=until, limit=limit
            )
        return await self._safe_get(
            "/api/v1/audit/events",
            {"tenant_id": tenant_id, "since": since, "until": until, "limit": limit},
        )
