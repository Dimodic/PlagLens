"""Homework-related schemas.

Homework — промежуточный уровень между Course и Assignment: набор заданий,
обычно одной недели (или одной темы). Каждый Assignment ссылается на
Homework через `homework_id`.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# Archive-only lifecycle: a homework is either ``active`` (visible to
# students) or ``archived``. ``draft`` / ``published`` are dropped.
HomeworkStatus = Literal["active", "archived"]


class HomeworkBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    # Auto-derived from ``title`` server-side; optional + ignored if a
    # client still sends one. See course.py CourseCreate for the rationale.
    slug: str | None = Field(
        default=None, max_length=120, pattern=r"^[a-z0-9][a-z0-9-]*$"
    )
    position: int = Field(default=0, ge=0)
    status: HomeworkStatus = "active"
    due_at: datetime | None = None


class HomeworkCreate(HomeworkBase):
    pass


class HomeworkUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    position: int | None = Field(default=None, ge=0)
    status: HomeworkStatus | None = None
    due_at: datetime | None = None


class HomeworkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    slug: str
    title: str
    description: str | None = None
    position: int = 0
    status: HomeworkStatus
    due_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None
    deleted_at: datetime | None = None


class HomeworkReorder(BaseModel):
    """Bulk reorder: ordered list of homework IDs."""

    homework_ids: list[int] = Field(min_length=1)
