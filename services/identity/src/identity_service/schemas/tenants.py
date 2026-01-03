"""Tenant schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class TenantOut(BaseModel):
    id: str
    slug: str
    name: str
    domain: str | None = None
    status: str = "active"
    created_at: datetime
    deleted_at: datetime | None = None


class TenantCreate(BaseModel):
    # Slug auto-derived from ``name`` server-side; never typed or shown.
    # Optional + ignored if a client still sends one.
    slug: str | None = Field(
        default=None, max_length=64, pattern=r"^[a-z0-9][a-z0-9_-]*$"
    )
    name: str = Field(min_length=1, max_length=255)
    domain: str | None = None
    cors_origins: list[str] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)


class TenantUpdate(BaseModel):
    name: str | None = None
    domain: str | None = None


class TenantSettingsOut(BaseModel):
    cors_origins: list[str] = Field(default_factory=list)
    settings: dict[str, Any] = Field(default_factory=dict)


class TenantSettingsUpdate(BaseModel):
    cors_origins: list[str] | None = None
    settings: dict[str, Any] | None = None


class TenantUsageOut(BaseModel):
    tenant_id: str
    users: int = 0
    teachers: int = 0
    students: int = 0
    active_sessions: int = 0
    courses: int = 0
    submissions_30d: int = 0
    llm_tokens_30d: int = 0
