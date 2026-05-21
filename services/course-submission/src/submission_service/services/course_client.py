"""HTTP client for Course Service — fetches assignment metadata.

In tests/local development we wire an in-memory implementation. The HTTP
implementation calls the Course Service over the gateway, so it can run in
an integrated stack (E2E tests + production). The in-memory variant remains
the test default.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

import httpx


@dataclass
class AssignmentInfo:
    id: str
    course_id: str
    tenant_id: str
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    late_score_multiplier: float = 1.0
    selection_strategy: str = "last"  # last | best | manual
    visible_to_students_at: datetime | None = None
    max_score: float | None = None


class CourseClient(Protocol):
    async def get_assignment(self, assignment_id: str) -> AssignmentInfo | None: ...


class InMemoryCourseClient:
    """Simple seedable client used by tests."""

    def __init__(self) -> None:
        self._store: dict[str, AssignmentInfo] = {}

    def seed(self, info: AssignmentInfo) -> None:
        self._store[info.id] = info

    async def get_assignment(self, assignment_id: str) -> AssignmentInfo | None:
        return self._store.get(assignment_id)


def _parse_dt(value: object) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _parse_float(value: object, default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class HttpCourseClient:
    """Calls the course service directly over HTTP.

    The service exposes ``GET /api/v1/assignments/{id}`` which is forwarded
    by the gateway, but service-to-service traffic skips the gateway and
    talks to the course service host directly. The base URL is read from
    the ``COURSE_SERVICE_URL`` env var at construction time.
    """

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (
            base_url
            or os.environ.get("COURSE_SERVICE_URL")
            or os.environ.get("COURSE_BASE_URL")
            or "http://course:8000"
        ).rstrip("/")
        self._client = httpx.AsyncClient(timeout=5.0)

    async def get_assignment(
        self, assignment_id: str, *, auth_token: str | None = None
    ) -> AssignmentInfo | None:
        # We use the public API path (gateway prefix) because course service
        # mounts routers under /api/v1/.
        url = f"{self._base_url}/api/v1/assignments/{assignment_id}"
        headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
        try:
            r = await self._client.get(url, headers=headers)
        except httpx.HTTPError:
            return None
        if r.status_code != 200:
            return None
        try:
            data = r.json()
        except Exception:
            return None
        tenant_id = str(data.get("tenant_id") or "")
        course_id = str(data.get("course_id") or "")
        # AssignmentRead doesn't expose tenant_id today (the column lives on
        # course, not assignment), so we fall back to a /courses/{id} probe.
        # That keeps cross-tenant super_admin imports (e.g. background YC
        # integration) routing submissions into the *course's* tenant rather
        # than the caller's (system).
        if not tenant_id and course_id:
            try:
                cr = await self._client.get(
                    f"{self._base_url}/api/v1/courses/{course_id}",
                    headers=headers,
                )
                if cr.status_code == 200:
                    cdata = cr.json()
                    tenant_id = str(cdata.get("tenant_id") or "")
            except httpx.HTTPError:
                pass
        return AssignmentInfo(
            id=str(data.get("id") or assignment_id),
            course_id=course_id,
            tenant_id=tenant_id,
            deadline_soft_at=_parse_dt(data.get("deadline_soft_at")),
            deadline_hard_at=_parse_dt(data.get("deadline_hard_at")),
            late_score_multiplier=_parse_float(data.get("late_score_multiplier"), 1.0),
            selection_strategy=str(data.get("selection_strategy") or "last"),
            visible_to_students_at=_parse_dt(data.get("visible_to_students_at")),
            max_score=_parse_float(data.get("max_score"), 0.0) or None,
        )

    async def aclose(self) -> None:
        await self._client.aclose()
