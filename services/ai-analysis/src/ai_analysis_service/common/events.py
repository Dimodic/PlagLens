"""CloudEvents envelope for ai-analysis.

Uses the shared :class:`plaglens_common.events.CloudEvent` (no local
re-definition); ``build_event`` is the single constructor and stamps the
ai-analysis ``source``.
"""
from __future__ import annotations

from typing import Any

from plaglens_common.events import CloudEvent

_SOURCE = "/services/ai-analysis"


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


__all__ = ["CloudEvent", "build_event"]
