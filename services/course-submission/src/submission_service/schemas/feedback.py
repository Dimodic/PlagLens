"""Feedback DTOs."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackIn(BaseModel):
    body: str = Field(min_length=1, max_length=20000)
    visible_to_student: bool = False


class FeedbackPatch(BaseModel):
    body: str | None = Field(default=None, max_length=20000)
    visible_to_student: bool | None = None


class FeedbackFromLLMIn(BaseModel):
    ai_analysis_id: str
    edited_body: str = Field(min_length=1)
    visible_to_student: bool = False


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    submission_id: str
    author_id: str
    body: str
    visible_to_student: bool
    source: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class BatchPublishIn(BaseModel):
    submission_ids: list[str] = Field(min_length=1, max_length=1000)
