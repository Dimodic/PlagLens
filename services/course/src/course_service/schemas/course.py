"""Course-level schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Archive-only lifecycle: a course is either visible to its students
# (``active``) or in the bin (``archived``). The legacy ``draft`` value
# is no longer accepted on the wire — pre-existing rows were migrated
# via SQL.
CourseStatus = Literal["active", "archived"]


class CourseBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=10_000)
    start_date: date | None = None
    end_date: date | None = None
    settings: dict[str, Any] = Field(default_factory=dict)


class CourseCreate(CourseBase):
    # Slug is auto-derived from ``name`` server-side and never shown to
    # or typed by users. Kept here as optional only so an older client
    # that still sends one doesn't fail validation — the service
    # ignores any provided value and always regenerates.
    slug: str | None = Field(
        default=None, max_length=120, pattern=r"^[a-z0-9][a-z0-9._-]*$"
    )


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=10_000)
    start_date: date | None = None
    end_date: date | None = None
    settings: dict[str, Any] | None = None


class CourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: str
    slug: str
    name: str
    description: str | None = None
    status: CourseStatus
    start_date: date | None = None
    end_date: date | None = None
    owner_id: str
    settings: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class CourseDuplicate(BaseModel):
    # Slug auto-derived from the clone's name server-side; never typed.
    new_slug: str | None = Field(
        default=None, max_length=120, pattern=r"^[a-z0-9][a-z0-9._-]*$"
    )
    new_name: str | None = Field(default=None, max_length=255)


class CourseStats(BaseModel):
    course_id: int
    members_count: int
    assignments_count: int
    groups_count: int


class DashboardSummary(BaseModel):
    """Placeholder shape for dashboard proxy.

    The real data lives in the Reporting Service; we return a stub here.
    """

    course_id: int
    members_count: int
    active_assignments: int
    upcoming_deadlines: int
    note: str = "Proxy to Reporting Service is stubbed (TODO)."
