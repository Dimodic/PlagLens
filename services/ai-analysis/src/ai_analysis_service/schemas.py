"""Pydantic v2 request/response schemas for AI Analysis Service."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

# (re-organized)


# ----------------------------- Domain types -----------------------------

class RiskSignal(BaseModel):
    type: Literal[
        "style_jump",
        "generic_solution",
        "non_idiomatic",
        "complexity_jump",
        "library_misuse",
        "stub_code",
        "other",
    ]
    severity: Literal["low", "medium", "high"]
    details: str
    line_range: tuple[int, int] | None = None


class PlagLensReport(BaseModel):
    # 1-2 sentence summary aimed at the student (visible if the teacher
    # publishes the analysis). Plain Russian, no jargon, ≤30 words.
    student_brief: str = ""
    # Longer teacher-facing summary, ≤200 words.
    summary: str
    risk_signals: list[RiskSignal] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


# ----------------------------- AIAnalysis IO ----------------------------

class CreateAnalysisRequest(BaseModel):
    prompt_version: str | None = None
    provider: str | None = None
    force_no_cache: bool = False
    # Submission source code to analyse. When omitted, the orchestrator
    # falls back to the ``X-Submission-Code`` header (test/dev) or fetches
    # from the submission service (production).
    code: str | None = None
    # Task context, passed by the caller (the submission page already has
    # the assignment loaded). Lets the LLM judge the code against the
    # actual problem statement instead of guessing the intent.
    assignment_title: str | None = None
    assignment_description: str | None = None


class RegenerateRequest(BaseModel):
    prompt_version: str | None = None
    provider: str | None = None
    force_no_cache: bool = True


class AnalysisOut(BaseModel):
    id: str
    tenant_id: str
    course_id: str | None = None
    assignment_id: str | None = None
    submission_id: str
    prompt_version: str
    provider: str
    model: str
    status: str
    trigger: str
    cache_hit: bool
    injection_suspected: bool
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cost_estimate: Decimal
    currency: str
    latency_ms: int
    parent_analysis_id: str | None = None
    failure_reason: str | None = None
    shared_with_student: bool
    curated_feedback_id: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime
    # The structured LLM output. Present once `status == 'completed'`; null
    # while the analysis is in flight or failed.
    report: PlagLensReport | None = None


# ----------------------------- Curate / share ---------------------------

class CurateAsFeedbackRequest(BaseModel):
    edited_summary: str | None = None
    include_risk_signals: list[str] = Field(default_factory=list)
    include_questions: list[int] = Field(default_factory=list)
    additional_text: str | None = None
    visible_to_student: bool = False


class CurateAsFeedbackResponse(BaseModel):
    analysis_id: str
    feedback_id: str
    visible_to_student: bool


# ----------------------------- Batch ------------------------------------

class BatchCreateRequest(BaseModel):
    scope: Literal["all", "selected", "suspicious_only"] = "all"
    submission_ids: list[str] = Field(default_factory=list)
    prompt_version: str | None = None
    provider: str | None = None


class BatchStats(BaseModel):
    total: int
    completed: int
    failed: int
    cancelled: int
    queued: int
    running: int
    average_total_tokens: float
    cache_hit_rate: float


# ----------------------------- Operation -------------------------------

class OperationCreated(BaseModel):
    operation_id: str
    status_url: str
