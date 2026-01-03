"""Invitation schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class InvitationOut(BaseModel):
    id: str
    tenant_id: str
    email: str
    role: str
    course_id: str | None = None
    expires_at: datetime
    accepted_at: datetime | None = None
    accepted_by: str | None = None
    created_at: datetime


class InvitationCreate(BaseModel):
    email: str
    role: str = "student"
    course_id: str | None = None
    expires_in_seconds: int = Field(default=7 * 24 * 3600, ge=60, le=90 * 24 * 3600)


class InvitationCreated(InvitationOut):
    token: str  # plain, returned once


class InvitationAccept(BaseModel):
    token: str
    password: str | None = None
    display_name: str | None = None
