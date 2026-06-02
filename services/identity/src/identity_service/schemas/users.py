"""User schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class UserOut(BaseModel):
    id: str
    tenant_id: str
    email: str
    display_name: str
    avatar_url: str | None = None
    locale: str = "ru"
    timezone: str = "UTC"
    status: str = "active"
    global_role: str
    email_verified: bool = False
    two_factor_enabled: bool = False
    created_at: datetime
    last_login_at: datetime | None = None
    deleted_at: datetime | None = None
    anonymized_at: datetime | None = None


class PublicProfileOut(BaseModel):
    """Trimmed, cross-tenant-safe directory card — no email/PII beyond
    name + org. Surfaced by global people search + the public profile."""

    id: str
    display_name: str
    avatar_url: str | None = None
    global_role: str
    tenant_id: str
    tenant_name: str | None = None
    tenant_slug: str | None = None
    created_at: datetime


class UserCreate(BaseModel):
    email: str
    display_name: str = Field(min_length=1, max_length=255)
    global_role: str = "student"
    locale: str = "ru"
    timezone: str = "UTC"
    password: str | None = None  # admin can set initial password
    tenant_id: str | None = None  # admin can target any tenant; otherwise own tenant


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=255)
    locale: str | None = None
    timezone: str | None = None
    avatar_url: str | None = None
    email: str | None = None  # add/change own email (empty string clears) — self-service or admin
    global_role: str | None = None  # admin only


class UserBatchCreate(BaseModel):
    emails: list[str] = Field(min_length=1, max_length=500)
    global_role: str = "student"
    tenant_id: str | None = None
    course_id: str | None = None
    send_invitation: bool = True


# ---- Bulk-import (richer, used by external integrations like Yandex.Contest) ----

class BulkImportItem(BaseModel):
    """One user row from an external system (e.g. a Yandex.Contest participant)."""
    external_id: str | None = None  # provider-side stable id (e.g. yandex uid)
    email: str | None = None        # may be empty for some providers; we synthesize a placeholder
    login: str | None = None        # yandex login / stepik username — used for display + placeholder email
    display_name: str | None = None
    global_role: str = "student"


class BulkImportRequest(BaseModel):
    items: list[BulkImportItem] = Field(min_length=1, max_length=2000)
    tenant_id: str | None = None  # admin can target any tenant; otherwise their own


class BulkImportResultItem(BaseModel):
    user_id: str
    email: str
    action: str  # "created" | "existing"
    # Echoed from the request so callers can build a login → user_id map
    # without having to re-correlate by index (the server may dedupe and
    # skip rows, breaking positional correspondence).
    external_id: str | None = None
    login: str | None = None


class BulkImportResult(BaseModel):
    tenant_id: str
    items: list[BulkImportResultItem]
    created: int
    existing: int
