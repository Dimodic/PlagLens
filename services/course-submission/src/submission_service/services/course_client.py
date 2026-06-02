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


@dataclass
class AssignmentTitles:
    """Denormalised titles for one assignment, used to label submission rows.

    Mirrors the shape ``self_service._enrich_titles`` needs: the assignment's
    own title plus the (optional) homework title and course name it rolls up
    into. ``homework_title`` / ``course_name`` are ``None`` when the parent row
    is missing (e.g. a course id that isn't an integer, matching the old
    ``isdigit()`` guard)."""

    assignment_title: str
    homework_title: str | None = None
    course_name: str | None = None


class CourseClient(Protocol):
    async def get_assignment(
        self, assignment_id: str, *, auth_token: str | None = None
    ) -> AssignmentInfo | None: ...

    async def visible_course_ids(self, user_id: str) -> set[str]:
        """Course ids the user owns or is a (non-removed) member of.

        String-keyed to match ``Submission.course_id``. Mirrors
        ``self_service._visible_course_ids``: owners are always included;
        members only while ``removed_at IS NULL``."""
        ...

    async def staff_course_ids(self, user_id: str) -> set[str]:
        """Course ids where the user is staff (owner or member, regardless of
        ``removed_at``). Used to scope the assistant inbox. Note this is the
        looser variant — unlike :meth:`visible_course_ids` it does NOT filter
        removed members, preserving the original assistant-scoping query."""
        ...

    async def search_assignment_ids_by_title(self, query: str) -> set[str]:
        """Assignment ids whose own title — or whose parent homework title —
        contains ``query`` (case-insensitive, ICU-folded so Cyrillic matches).
        String-keyed. Best-effort: returns an empty set on any failure."""
        ...

    async def enrich_titles(
        self, assignment_ids: list[str]
    ) -> dict[str, AssignmentTitles]:
        """Map assignment id -> denormalised titles for a page of rows.

        Resolves assignment title, parent homework title and course name via a
        few batched ``IN`` lookups. Keys are the string assignment ids that
        actually resolved; ids that don't parse as integers or have no row are
        omitted (the caller then leaves those rows' labels untouched)."""
        ...


class InMemoryCourseClient:
    """Simple seedable client used by tests."""

    def __init__(self) -> None:
        self._store: dict[str, AssignmentInfo] = {}

    def seed(self, info: AssignmentInfo) -> None:
        self._store[info.id] = info

    async def get_assignment(
        self, assignment_id: str, *, auth_token: str | None = None
    ) -> AssignmentInfo | None:
        # In-memory client has no auth concept; the kwarg exists only so the
        # signature matches ``HttpCourseClient`` (whose batchImport call site
        # passes the caller's bearer for cross-tenant authorisation).
        del auth_token
        return self._store.get(assignment_id)

    # The read-model methods below back the student/staff scoping + search in
    # self_service. The in-memory stub has no course tables, so it returns
    # empty results — the same graceful-degradation the old code fell back to
    # when its cross-schema queries tripped (no rows scoped/matched/enriched).
    async def visible_course_ids(self, user_id: str) -> set[str]:
        del user_id
        return set()

    async def staff_course_ids(self, user_id: str) -> set[str]:
        del user_id
        return set()

    async def search_assignment_ids_by_title(self, query: str) -> set[str]:
        del query
        return set()

    async def enrich_titles(
        self, assignment_ids: list[str]
    ) -> dict[str, AssignmentTitles]:
        del assignment_ids
        return {}


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
        # That keeps cross-tenant admin imports (e.g. background YC
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

    # Read-model methods for self_service scoping/search. These exist only so
    # ``HttpCourseClient`` stays a structural ``CourseClient`` (it is dormant in
    # the merged deployable — see submission_service.api.deps.get_course_client).
    # The merged process always wires ``InProcessCourseClient`` for these. If
    # course+submission are ever re-split, these need real course endpoints; for
    # now they return the empty/best-effort result so a stray wiring can't 500.
    async def visible_course_ids(self, user_id: str) -> set[str]:
        del user_id
        return set()

    async def staff_course_ids(self, user_id: str) -> set[str]:
        del user_id
        return set()

    async def search_assignment_ids_by_title(self, query: str) -> set[str]:
        del query
        return set()

    async def enrich_titles(
        self, assignment_ids: list[str]
    ) -> dict[str, AssignmentTitles]:
        del assignment_ids
        return {}

    async def aclose(self) -> None:
        await self._client.aclose()
