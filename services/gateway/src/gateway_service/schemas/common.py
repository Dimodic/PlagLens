"""Common Pydantic schemas: Problem (RFC 7807), Health, Version, Operation."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Problem(BaseModel):
    """RFC 7807 problem details."""

    model_config = ConfigDict(extra="allow")

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str | None = None
    request_id: str | None = None
    errors: list[dict[str, Any]] | None = None


class VersionInfo(BaseModel):
    service: str
    version: str
    commit: str
    built_at: str
    environment: str


class BackendHealth(BaseModel):
    name: str
    healthy: bool
    status_code: int | None = None
    latency_ms: float | None = None
    error: str | None = None


class HealthAggregate(BaseModel):
    status: Literal["healthy", "degraded", "unhealthy"]
    backends: list[BackendHealth]


class ServicesStatus(BaseModel):
    backends: list[BackendHealth]
    healthy_count: int
    total_count: int


class OperationDispatchInfo(BaseModel):
    """Helper info — not exposed to clients but used internally."""

    op_id: str
    backend: str
    backend_url: str


class OperationListItem(BaseModel):
    """Best-effort merged item from multiple backends."""

    id: str
    kind: str
    status: str
    started_at: str | None = None
    finished_at: str | None = None


class OperationListResponse(BaseModel):
    data: list[OperationListItem] = Field(default_factory=list)
    pagination: dict[str, Any] = Field(default_factory=dict)


__all__ = [
    "Problem",
    "VersionInfo",
    "BackendHealth",
    "HealthAggregate",
    "ServicesStatus",
    "OperationDispatchInfo",
    "OperationListItem",
    "OperationListResponse",
]
