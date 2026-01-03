"""CloudEvents-compatible envelope utilities."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


class CloudEvent(BaseModel):
    specversion: str = "1.0"
    id: str = Field(default_factory=lambda: f"evt_{uuid.uuid4().hex}")
    type: str
    source: str = "/services/submission"
    subject: str | None = None
    time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    datacontenttype: str = "application/json"
    tenant_id: str | None = None
    actor: dict[str, Any] | None = None
    trace_id: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


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
        tenant_id=tenant_id,
        subject=subject,
        data=data or {},
        actor=actor,
        trace_id=trace_id,
    )
