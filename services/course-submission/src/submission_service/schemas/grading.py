"""Grade DTOs."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GradeIn(BaseModel):
    score: float = Field(ge=0)
    max_score: float | None = Field(default=None, ge=0)
    # Defaults to True — in an academic setting a saved grade is
    # expected to be visible to the student immediately. The teacher
    # can still pass ``False`` to keep a draft grade hidden until the
    # release moment (e.g. cohort-wide release).
    comment_visible_to_student: bool = True
    comment: str | None = None


class GradePatch(BaseModel):
    score: float | None = Field(default=None, ge=0)
    max_score: float | None = Field(default=None, ge=0)
    comment_visible_to_student: bool | None = None
    comment: str | None = None


class GradeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    submission_id: str
    score: float | None
    max_score: float | None
    applied_multiplier: float
    graded_by: str | None = None
    graded_at: datetime | None = None
    comment_visible_to_student: bool
    comment: str | None = None
    updated_at: datetime
    history: list[dict[str, Any]] = Field(default_factory=list)
    # Author identity — only populated by list endpoints that join the
    # grade back to its submission (e.g. ``GET /assignments/{id}/grades``).
    # The per-submission grade endpoints leave these ``None`` since the
    # caller already knows the submission. Lets the reporting service build
    # a per-student grade matrix without a second round-trip.
    author_id: str | None = None
    author_label: str | None = None


class GradeHistoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    submission_id: str
    score: float | None
    applied_multiplier: float | None
    graded_by: str | None
    graded_at: datetime
    action: str
    note: str | None = None


class BulkGradeItem(BaseModel):
    submission_id: str
    score: float = Field(ge=0)
    comment_visible_to_student: bool = True


class BulkGradeIn(BaseModel):
    items: list[BulkGradeItem] = Field(min_length=1, max_length=1000)
