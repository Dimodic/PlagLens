"""CloudEvents envelope + domain event types for plagiarism (per 03-EVENTS.md).

Uses the shared :class:`plaglens_common.events.CloudEvent` (no local
re-definition); ``build_event`` is the single constructor and stamps the
plagiarism ``source``.
"""
from __future__ import annotations

from typing import Any

from plaglens_common.events import CloudEvent

_SOURCE = "/services/plagiarism"


def build_event(
    type_: str,
    *,
    tenant_id: str | None,
    subject: str | None = None,
    data: dict[str, Any] | None = None,
    actor: dict[str, Any] | None = None,
    trace_id: str | None = None,
) -> CloudEvent:
    return CloudEvent(
        type=type_,
        source=_SOURCE,
        tenant_id=tenant_id,
        subject=subject,
        data=data or {},
        actor=actor,
        trace_id=trace_id,
    )


# Plagiarism event type constants (see 03-EVENTS.md §Plagiarism)
EVT_RUN_QUEUED = "plaglens.plagiarism.run.queued.v1"
EVT_RUN_STARTED = "plaglens.plagiarism.run.started.v1"
EVT_RUN_PROGRESS = "plaglens.plagiarism.run.progress.v1"
EVT_RUN_COMPLETED = "plaglens.plagiarism.run.completed.v1"
EVT_RUN_FAILED = "plaglens.plagiarism.run.failed.v1"
EVT_SUSPICIOUS_FLAGGED = "plaglens.plagiarism.suspicious_pair.flagged.v1"
