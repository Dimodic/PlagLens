"""Operation resource (Canvas-style async; cross-cutting §7)."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field


class OperationProgress(BaseModel):
    completed: int = 0
    total: int = 0
    percent: float = 0.0


class Operation(BaseModel):
    id: str
    kind: str
    status: str = "queued"
    progress: OperationProgress = Field(default_factory=OperationProgress)
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None
    result_url: str | None = None
    error: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OperationCreated(BaseModel):
    operation_id: str
    status_url: str
