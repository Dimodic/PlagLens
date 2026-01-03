"""Per-submission view schemas (§C)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SubmissionPercentage(BaseModel):
    """Student-only payload — no pair/fragments/peer details exposed."""

    submission_id: str
    max_similarity_with_others: float | None = None
    checked_at: datetime | None = None
    flagged: bool = False


class SubmissionPlagiarismLatest(BaseModel):
    submission_id: str
    latest_run_id: str | None = None
    provider: str | None = None
    max_similarity: float | None = None
    pairs_count: int = 0
    suspicious: bool = False
    last_checked_at: datetime | None = None
