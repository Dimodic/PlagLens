"""Shared schemas: Operation, Page, etc."""
from __future__ import annotations

from datetime import datetime
from typing import Any, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class Progress(BaseModel):
    completed: int = 0
    total: int = 0
    percent: float = 0.0


class Operation(BaseModel):
    id: str
    kind: str
    status: str
    progress: Progress = Field(default_factory=Progress)
    started_at: datetime | None = None
    updated_at: datetime | None = None
    finished_at: datetime | None = None
    result_url: str | None = None
    error: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class OperationAck(BaseModel):
    operation_id: str
    status_url: str


class HealthResponse(BaseModel):
    status: str
    service: str
    checks: dict[str, str] = Field(default_factory=dict)


class VersionResponse(BaseModel):
    version: str
    commit: str = "dev"
    built_at: str = "1970-01-01T00:00:00Z"
