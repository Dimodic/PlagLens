"""Cross-course corpus schemas (§D)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CorpusStats(BaseModel):
    tenant_id: str
    total_entries: int = 0
    by_language: dict[str, int] = Field(default_factory=dict)
    by_course: dict[str, int] = Field(default_factory=dict)
    last_added_at: datetime | None = None


class CorpusEntryItem(BaseModel):
    id: str
    submission_id: str
    course_id: str | None = None
    assignment_id: str | None = None
    language: str | None = None
    token_count: int = 0
    added_at: datetime


class CorpusRebuildResponse(BaseModel):
    operation_id: str
    enqueued_count: int


class CorpusSearchRequest(BaseModel):
    submission_id: str
    top_k: int = Field(default=20, ge=1, le=100)
    min_similarity: float = Field(default=0.4, ge=0.0, le=1.0)
    language: str | None = None


class CorpusSearchHit(BaseModel):
    entry_id: str
    submission_id: str
    course_id: str | None = None
    assignment_id: str | None = None
    similarity: float


class CorpusSearchResponse(BaseModel):
    query_submission_id: str
    hits: list[CorpusSearchHit]
