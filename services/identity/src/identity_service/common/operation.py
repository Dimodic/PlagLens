"""Operation resource (Canvas-style) for async actions."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal, Optional

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
    started_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: Optional[datetime] = None
    result_url: Optional[str] = None
    error: Optional[dict[str, Any]] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OperationAccepted(BaseModel):
    """202 body for kicking off an async action."""

    operation_id: str
    status_url: str
