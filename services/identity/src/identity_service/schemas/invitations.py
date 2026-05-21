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
    code: str | None = None
    expires_at: datetime
    accepted_at: datetime | None = None
    accepted_by: str | None = None
    created_at: datetime


class InvitationCreate(BaseModel):
    # Email is optional now — for "give the student a code in person" we still
    # generate the invitation but skip the email send. Server validates that
    # at least one of (email, code) is meaningful.
    email: str | None = None
    role: str = "student"
    course_id: str | None = None
    expires_in_seconds: int = Field(default=7 * 24 * 3600, ge=60, le=90 * 24 * 3600)


class InvitationCreated(InvitationOut):
    token: str  # plain, returned once


class InvitationAccept(BaseModel):
    token: str
    password: str | None = None
    display_name: str | None = None


class InvitationRedeem(BaseModel):
    """Body of POST /invitations:redeem — authenticated user types the code."""
    code: str = Field(min_length=1, max_length=16)


class InvitationRedeemResult(BaseModel):
    invitation_id: str
    role_applied: str | None = None  # populated when global_role was promoted
    course_id: str | None = None
    course_role: str | None = None
    requires_relogin: bool = False  # true when global_role changed
