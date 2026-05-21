"""Admin-side schemas: retention policy, legal holds, stats."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RetentionPolicyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    scope: str
    scope_id: str | None = None
    default_retention_days: int
    long_retention_days: int
    legal_hold_active: bool
    updated_at: datetime
    updated_by: str | None = None


class RetentionPolicyPatch(BaseModel):
    default_retention_days: int | None = Field(default=None, ge=1, le=36500)
    long_retention_days: int | None = Field(default=None, ge=1, le=36500)
    legal_hold_active: bool | None = None


class RetentionStatusOut(BaseModel):
    pending_cleanup_partitions: list[str]
    next_cleanup_at: datetime | None = None
    last_cleanup_at: datetime | None = None
    last_cleanup_dropped: int = 0


class RetentionRunResponse(BaseModel):
    dry_run: bool
    candidate_partitions: list[str]
    blocked_by_legal_hold: list[str]
    dropped: list[str] = Field(default_factory=list)


class LegalHoldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    tenant_id: str | None = None
    resource_type: str | None = None
    resource_id: str
    reason: str
    started_at: datetime
    ended_at: datetime | None = None
    requested_by: str | None = None


class LegalHoldCreate(BaseModel):
    resource_id: str = Field(..., min_length=1, max_length=64)
    resource_type: str | None = None
    reason: str = Field(..., min_length=1, max_length=1000)


class StatsOut(BaseModel):
    total_events: int
    by_action: list[dict[str, Any]]
    by_result: list[dict[str, Any]]
    error_rate: float
    storage_bytes_estimate: int
