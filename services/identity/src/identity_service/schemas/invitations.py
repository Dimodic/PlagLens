"""Invitation schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


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
    # Cross-tenant invitations: admin (the super-admin equivalent) can target
    # any tenant — the field is ignored for teacher callers (they're pinned to
    # their own tenant). When unset the caller's own tenant is used.
    tenant_id: str | None = None
    expires_in_seconds: int = Field(default=7 * 24 * 3600, ge=60, le=90 * 24 * 3600)

    @field_validator("course_id", mode="before")
    @classmethod
    def _coerce_course_id(cls, v: Any) -> Any:
        """Course-service exposes course IDs as integers — frontend, e2e tests
        and external callers naturally pass them as numbers. Identity stores
        them as String(40); coerce here so we don't reject perfectly valid
        callers with a 422."""
        if v is None or isinstance(v, str):
            return v
        if isinstance(v, (int, float)):
            return str(int(v))
        return v


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
