"""Assignment-related schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# Archive-only lifecycle (see CourseStatus / HomeworkStatus). ``draft``
# and ``published`` were merged into ``active`` via SQL migration; the
# accompanying ``publish``/``unpublish`` endpoints have been removed.
AssignmentStatus = Literal["active", "archived"]
SelectionStrategy = Literal["last", "best", "manual"]


class ExternalBinding(BaseModel):
    system: str = Field(min_length=1, max_length=64)
    external_assignment_id: str = Field(min_length=1, max_length=255)


class AssignmentBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    language_hint: str | None = Field(default=None, max_length=32)
    max_score: Decimal = Field(default=Decimal("10"), ge=0, le=10_000)
    weight: Decimal = Field(default=Decimal("1"), ge=0, le=1_000)
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    late_score_multiplier: Decimal = Field(default=Decimal("1"), ge=0, le=2)
    selection_strategy: SelectionStrategy = "last"
    plagiarism_auto_run: bool = False
    plagiarism_threshold: Decimal = Field(default=Decimal("0.6"), ge=0, le=1)
    ai_auto_run: bool = False
    ai_prompt_version: str | None = None
    external_bindings: list[ExternalBinding] = Field(default_factory=list)


class AssignmentCreate(AssignmentBase):
    # Auto-derived from ``title`` server-side; optional + ignored if a
    # client still sends one. See course.py CourseCreate for the rationale.
    slug: str | None = Field(
        default=None, max_length=120, pattern=r"^[a-z0-9][a-z0-9._-]*$"
    )
    homework_id: int | None = None


class AssignmentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=100_000)
    language_hint: str | None = Field(default=None, max_length=32)
    max_score: Decimal | None = Field(default=None, ge=0, le=10_000)
    weight: Decimal | None = Field(default=None, ge=0, le=1_000)
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    late_score_multiplier: Decimal | None = Field(default=None, ge=0, le=2)
    selection_strategy: SelectionStrategy | None = None
    plagiarism_auto_run: bool | None = None
    plagiarism_threshold: Decimal | None = Field(default=None, ge=0, le=1)
    ai_auto_run: bool | None = None
    ai_prompt_version: str | None = None
    external_bindings: list[ExternalBinding] | None = None
    homework_id: int | None = None


class AssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    homework_id: int | None = None
    slug: str
    title: str
    description: str | None = None
    language_hint: str | None = None
    status: AssignmentStatus
    max_score: Decimal
    weight: Decimal
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    late_score_multiplier: Decimal
    selection_strategy: SelectionStrategy
    plagiarism_auto_run: bool
    plagiarism_threshold: Decimal
    ai_auto_run: bool
    ai_prompt_version: str | None = None
    external_bindings: list[ExternalBinding] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class AssignmentDuplicate(BaseModel):
    target_course_id: int | None = None
    # Slug auto-derived from the clone's title server-side; never typed.
    new_slug: str | None = Field(
        default=None, max_length=120, pattern=r"^[a-z0-9][a-z0-9._-]*$"
    )
    new_title: str | None = None


class AssignmentDeadlines(BaseModel):
    deadline_soft_at: datetime | None
    deadline_hard_at: datetime | None
    late_score_multiplier: Decimal


class AssignmentDeadlinesUpdate(BaseModel):
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    late_score_multiplier: Decimal | None = Field(default=None, ge=0, le=2)


class DeadlineExtensionCreate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=500)


class DeadlineExtensionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignment_id: int
    user_id: str
    deadline_soft_at: datetime | None = None
    deadline_hard_at: datetime | None = None
    reason: str | None = None
    created_by: str
    created_at: datetime


class EffectiveDeadline(BaseModel):
    assignment_id: int
    user_id: str
    deadline_soft_at: datetime | None
    deadline_hard_at: datetime | None
    extended: bool
    extension_id: int | None = None


class GradingConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    assignment_id: int
    rubric: dict[str, Any] = Field(default_factory=dict)
    pass_threshold: Decimal | None = None
    visible_to_students_at: datetime | None = None
    updated_at: datetime


class GradingConfigUpdate(BaseModel):
    rubric: dict[str, Any] | None = None
    pass_threshold: Decimal | None = Field(default=None, ge=0, le=10_000)
    visible_to_students_at: datetime | None = None


class StatsTimelinePoint(BaseModel):
    date: str
    count: int
