"""Seam for reading submission-side assignment aggregates.

``AssignmentService.stats()`` needs submission counts/grades, which the
*submission* service owns. This module defines the thin interface
(``SubmissionStatsClient``) plus a process-level wiring slot, mirroring
submission's own ``CourseClient`` seam (``set_course_client`` /
``get_course_client``):

  * In the merged course+submission deployable, startup
    (``wire_shared_session``) injects an in-process implementation that reads
    the submission tables directly — no HTTP, since submission runs in the same
    process.
  * In the course-only app / unit tests nothing is wired, so
    ``get_submission_stats_client()`` returns ``None`` and ``stats()`` falls
    back to zeros (best-effort), exactly as the old HTTP proxy degraded when
    submission was unreachable.

``course_service`` deliberately imports nothing from ``submission_service``
here — it only knows this Protocol, the same way ``submission_service`` only
knows ``CourseClient``. The concrete in-process client lives in the merge
package and is injected at startup.
"""

from __future__ import annotations

from typing import Any, Protocol


class SubmissionStatsClient(Protocol):
    async def aggregate_stats(
        self, *, assignment_id: str, tenant_id: str
    ) -> dict[str, Any]:
        """Submission-side aggregate for an assignment: ``submissions_count``,
        ``students_submitted``, ``late_count``, ``average_score``,
        ``graded_count`` — the exact shape the HTTP proxy returned."""
        ...


_client: SubmissionStatsClient | None = None


def set_submission_stats_client(client: SubmissionStatsClient | None) -> None:
    """Wire the in-process client (called by the merged deployable at startup)."""
    global _client
    _client = client


def get_submission_stats_client() -> SubmissionStatsClient | None:
    return _client


__all__ = [
    "SubmissionStatsClient",
    "get_submission_stats_client",
    "set_submission_stats_client",
]
