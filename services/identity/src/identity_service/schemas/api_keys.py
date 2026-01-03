"""API key schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ApiKeyOut(BaseModel):
    id: str
    name: str
    scopes: list[str] = Field(default_factory=list)
    created_at: datetime
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    revoked_at: datetime | None = None


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: list[str] = Field(default_factory=list)
    expires_at: datetime | None = None


class ApiKeyCreated(BaseModel):
    """Returned ONCE at creation/rotation; the plain key is never persisted."""

    id: str
    name: str
    key: str  # plain bearer token, shown once
    scopes: list[str] = Field(default_factory=list)
    created_at: datetime
    expires_at: datetime | None = None
