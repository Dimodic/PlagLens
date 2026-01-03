"""Suspicious flag schemas (§E)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SeverityEnum = Literal["low", "medium", "high"]


class PairedAuthor(BaseModel):
    """Identity of a submission this flag was matched against. Returned
    alongside ``paired_with`` so the frontend can render «совпало с
    ФИО» without doing N extra HTTP calls itself."""
    submission_id: str
    author_id: str | None = None
    display_name: str | None = None


class SuspiciousFlagCreate(BaseModel):
    reason: str = Field(min_length=1, max_length=64)
    severity: SeverityEnum = "low"
    similarity: float | None = None
    paired_with: list[str] = Field(default_factory=list)


class SuspiciousFlagDismiss(BaseModel):
    reason: str = Field(min_length=1, max_length=512)


class SuspiciousFlagItem(BaseModel):
    id: str
    # The frontend list view keys rows / fires mutations against
    # ``flag_id``; the rest of the API uses ``id``. Mirror so both work.
    flag_id: str
    submission_id: str
    run_id: str | None = None
    reason: str
    severity: SeverityEnum
    similarity: float | None = None
    paired_with: list[str] = Field(default_factory=list)
    created_at: datetime
    created_by: str | None = None
    cleared_at: datetime | None = None
    cleared_by: str | None = None
    dismiss_reason: str | None = None
    # Enrichment from the submission service — populated only when the
    # course-level list endpoint can resolve the underlying submission.
    # `author_id` is the PlagLens user id (when the submission was made
    # by a real user) and `author_display_name` is either the resolved
    # ФИО or the external participant label (e.g. YC nickname).
    author_id: str | None = None
    author_display_name: str | None = None
    assignment_id: str | None = None
    # Per-peer identity for the IDs in `paired_with`. Same enrichment
    # pipeline as `author_*`; resolved via the submission service.
    paired_with_authors: list[PairedAuthor] = Field(default_factory=list)
