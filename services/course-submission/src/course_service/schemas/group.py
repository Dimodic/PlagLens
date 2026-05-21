"""Group schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=1, le=100_000)
    settings: dict[str, Any] = Field(default_factory=dict)


class GroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    capacity: int | None = Field(default=None, ge=1, le=100_000)
    settings: dict[str, Any] | None = None


class GroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    name: str
    capacity: int | None = None
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    deleted_at: datetime | None = None


class GroupMemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    group_id: int
    user_id: str
    joined_at: datetime
