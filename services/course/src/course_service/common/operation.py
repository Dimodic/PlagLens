"""Async Operation envelope (Canvas-style) — minimal local definition."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

OperationStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


class OperationProgress(BaseModel):
    completed: int = 0
    total: int = 0
    percent: float = 0.0


class Operation(BaseModel):
    id: str
    kind: str
    status: OperationStatus = "queued"
    progress: OperationProgress = Field(default_factory=OperationProgress)
    started_at: datetime | None = None
    updated_at: datetime | None = None
    finished_at: datetime | None = None
    result_url: str | None = None
    error: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
