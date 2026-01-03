"""IntegrationConfig schemas."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConfigKind(str, Enum):
    stepik = "stepik"
    yandex_contest = "yandex_contest"
    ejudge = "ejudge"
    manual = "manual"
    telegram = "telegram"
    google_sheets = "google_sheets"


class ConfigStatus(str, Enum):
    pending_auth = "pending_auth"
    active = "active"
    disabled = "disabled"
    error = "error"


class IntegrationConfigCreate(BaseModel):
    kind: ConfigKind
    course_id: Optional[str] = None
    display_name: str = Field(..., min_length=1, max_length=200)
    settings: dict[str, Any] = Field(default_factory=dict)


class IntegrationConfigUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=200)
    settings: Optional[dict[str, Any]] = None
    status: Optional[ConfigStatus] = None


class IntegrationConfigOut(BaseModel):
    id: str
    tenant_id: str
    course_id: Optional[str]
    kind: ConfigKind
    display_name: str
    status: ConfigStatus
    settings: dict[str, Any]
    cursor: dict[str, Any]
    last_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    last_sync_error: Optional[str]
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class IntegrationConfigCreateResponse(BaseModel):
    config: IntegrationConfigOut
    oauth_authorize_url: Optional[str] = None


class TestConnectionResult(BaseModel):
    ok: bool
    detail: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
