"""In-process ``SubmissionStatsClient`` for the merged course+submission service.

Course's ``AssignmentService.stats()`` used to fan out over HTTP to submission's
``/assignments/{id}/aggregate-stats``. Submission now runs in the SAME process,
so this client replaces that one hop with a direct in-process read of the
submission tables — the mirror image of how ``InProcessCourseClient`` replaced
submission's HTTP ``CourseClient``.

It opens a session on submission's shared factory (bound to the single engine by
``wire_shared_session`` via ``submission_service.db.set_session_factory``) and
calls the very repository method the HTTP endpoint called
(``SubmissionRepository.assignment_aggregate_stats``), so the returned numbers
are byte-for-byte identical to the old proxy.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import async_sessionmaker

from submission_service.repositories.submission_repo import SubmissionRepository


class InProcessSubmissionStatsClient:
    """``SubmissionStatsClient`` backed by a direct read of the submission
    tables, via submission's own repository."""

    def __init__(self, session_factory: async_sessionmaker[Any]) -> None:
        self._session_factory = session_factory

    async def aggregate_stats(
        self, *, assignment_id: str, tenant_id: str
    ) -> dict[str, Any]:
        # Same query the HTTP endpoint ran (submission owns these tables), just
        # without the network hop. We open our own submission session (correct
        # ``search_path``) rather than borrowing the course-side session.
        # ``tenant_id`` is the caller's JWT tenant — the exact value the proxied
        # endpoint read from the bearer — so the ``WHERE tenant_id = ...``
        # scoping is preserved.
        async with self._session_factory() as session:
            repo = SubmissionRepository(session)
            return await repo.assignment_aggregate_stats(
                assignment_id=assignment_id, tenant_id=tenant_id
            )


__all__ = ["InProcessSubmissionStatsClient"]
