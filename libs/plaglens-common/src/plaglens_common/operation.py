"""Async Operation resource (Canvas-style).

"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .headers import LOCATION
from .problem import Problem


class OperationStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class OperationProgress(BaseModel):
    model_config = ConfigDict(extra="forbid")

    completed: int = 0
    total: int = 0
    percent: float = 0.0

class Operation(BaseModel):
    """An async long-running operation tracked at `/v1/operations/{id}`."""

    model_config = ConfigDict(extra="allow")

    id: str
    kind: str
    status: OperationStatus = OperationStatus.QUEUED
    progress: OperationProgress | None = None
    started_at: datetime | None = None
    updated_at: datetime | None = None
    finished_at: datetime | None = None
    result_url: str | None = None
    error: Problem | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

def operation_response(op_id: str, location: str | None = None) -> Any:
    """Return a 202 Accepted FastAPI/Starlette `JSONResponse` with `Location`.

    Lazy-imports starlette so the lib does not require FastAPI at import time.
    """
    try:
        from starlette.responses import JSONResponse  # type: ignore[import-not-found]
    except ImportError as imp_err:  # pragma: no cover
        raise RuntimeError(
            "FastAPI/Starlette is required for operation_response"
        ) from imp_err

    location_url = location or f"/v1/operations/{op_id}"
    return JSONResponse(
        status_code=202,
        content={"operation_id": op_id, "status_url": location_url},
        headers={LOCATION: location_url},
    )

__all__ = [
    "Operation",
    "OperationProgress",
    "OperationStatus",
    "operation_response",
]
