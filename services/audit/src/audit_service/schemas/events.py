"""Pydantic schemas for AuditEvent read/write."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ActorIn(BaseModel):
    type: str = "user"
    id: str | None = None
    role: str | None = None


class ResourceIn(BaseModel):
    type: str | None = None
    id: str | None = None
    parent_id: str | None = None
    parent_type: str | None = None


class AuditEventCreate(BaseModel):
    """Internal write API payload."""

    model_config = ConfigDict(extra="ignore")

    event_id: str | None = None
    tenant_id: str | None = None
    occurred_at: datetime | None = None
    actor: ActorIn = Field(default_factory=ActorIn)
    action: str
    result: str = "success"
    resource: ResourceIn = Field(default_factory=ResourceIn)
    source_service: str | None = None
    request_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    retention_class: str = "default"


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    event_id: str | None = None
    tenant_id: str | None = None
    occurred_at: datetime
    recorded_at: datetime
    actor: dict[str, Any]
    action: str
    result: str
    resource: dict[str, Any]
    source_service: str | None = None
    request_id: str | None = None
    ip: str | None = None
    user_agent: str | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata_")
    retention_class: str


class EventSearchFilters(BaseModel):
    actor_id: str | None = None
    actor_type: str | None = None
    action: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    result: str | None = None
    source_service: str | None = None
    since: datetime | None = None
    until: datetime | None = None


class EventSearchAggregation(BaseModel):
    type: str = "count"
    by: str = "action"


class EventSearchRequest(BaseModel):
    q: str | None = None
    filters: EventSearchFilters = Field(default_factory=EventSearchFilters)
    aggregations: list[EventSearchAggregation] = Field(default_factory=list)
    limit: int = Field(50, ge=1, le=200)
    cursor: str | None = None


class EventSearchAggResult(BaseModel):
    by: str
    buckets: list[dict[str, Any]]


class EventExportRequest(BaseModel):
    format: str = Field("csv", pattern="^(csv|json)$")
    filters: EventSearchFilters = Field(default_factory=EventSearchFilters)


class EventExportResponse(BaseModel):
    operation_id: str
    status_url: str


class IngestResponse(BaseModel):
    id: str
    deduplicated: bool = False
