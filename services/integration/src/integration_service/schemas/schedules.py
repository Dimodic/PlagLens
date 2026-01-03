"""Sync schedule schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


def _validate_cron(value: str) -> str:
    parts = value.strip().split()
    if len(parts) not in (5, 6):
        raise ValueError("cron must have 5 or 6 fields")
    return value


class ScheduleCreate(BaseModel):
    cron: str
    scope: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True

    @field_validator("cron")
    @classmethod
    def cron_format(cls, v: str) -> str:
        return _validate_cron(v)


class ScheduleUpdate(BaseModel):
    cron: Optional[str] = None
    scope: Optional[dict[str, Any]] = None
    enabled: Optional[bool] = None

    @field_validator("cron")
    @classmethod
    def cron_format(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_cron(v)


class ScheduleOut(BaseModel):
    id: str
    integration_id: str
    cron: str
    scope: dict[str, Any]
    enabled: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True
