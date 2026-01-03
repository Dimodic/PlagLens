"""Import / sync schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SyncScope(BaseModel):
    course_id: Optional[str] = None
    assignment_id: Optional[str] = None
    since: Optional[datetime] = None


class SyncRequest(BaseModel):
    scope: SyncScope = Field(default_factory=SyncScope)
    force_full: bool = False


class ImportJobOut(BaseModel):
    id: str
    integration_id: str
    tenant_id: str
    scope: dict[str, Any]
    trigger: str
    status: str
    progress: dict[str, Any]
    stats: dict[str, Any]
    error: Optional[dict[str, Any]] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
