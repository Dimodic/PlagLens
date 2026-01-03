"""Invitation schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

InviteRole = Literal["student", "assistant"]


class InvitationCreate(BaseModel):
    role: InviteRole = "student"
    # Permissive ``str`` (rather than EmailStr) so reserved-name TLDs and
    # internal/test domains pass validation; the address is treated as a
    # human-readable label, not authoritative.
    email: str | None = Field(default=None, max_length=255)
    max_uses: int = Field(default=1, ge=1, le=10_000)
    expires_at: datetime | None = None


class InvitationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    code: str
    role: InviteRole
    email: str | None = None
    max_uses: int
    used_count: int
    expires_at: datetime | None = None
    created_by: str
    created_at: datetime
    revoked_at: datetime | None = None


class JoinByCodeRequest(BaseModel):
    code: str = Field(min_length=4, max_length=64)


class JoinByCodeResponse(BaseModel):
    course_id: int
    role: InviteRole
