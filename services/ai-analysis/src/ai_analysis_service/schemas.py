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


# ----------------------------- Prompt versions --------------------------

class PromptVersionCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=200)
    system_prompt: str
    user_template: str
    json_schema: dict[str, Any]


class PromptVersionUpdate(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    user_template: str | None = None
    json_schema: dict[str, Any] | None = None


class PromptVersionOut(BaseModel):
    id: str
    tenant_id: str
    name: str
    system_prompt: str
    user_template: str
    json_schema: dict[str, Any]
    active_for_tenant: bool
    created_at: datetime
    deactivated_at: datetime | None = None


class PromptVersionTestRequest(BaseModel):
    submission_id: str
    provider: str | None = None


# ----------------------------- Provider configs -------------------------

class ProviderConfigCreate(BaseModel):
    provider: str
    base_url: str
    model: str
    # ``api_key`` is optional and stored as ``api_key_secret_ref`` (legacy / Vault).
    # **Preferred**: pass ``api_key_env_var`` and keep the actual key in env / Vault.
    api_key: str | None = None
    api_key_env_var: str | None = None
    priority: int = 100
    rate_limit_rpm: int = 60
    max_tokens: int = 8192
    supports_json_schema: bool = True
    settings: dict[str, Any] = Field(default_factory=dict)


class ProviderConfigUpdate(BaseModel):
    base_url: str | None = None
    model: str | None = None
    api_key: str | None = None
    api_key_env_var: str | None = None
    priority: int | None = None
    rate_limit_rpm: int | None = None
    max_tokens: int | None = None
    enabled: bool | None = None
    supports_json_schema: bool | None = None
    settings: dict[str, Any] | None = None


class ProviderConfigOut(BaseModel):
    id: str
    tenant_id: str
    provider: str
    base_url: str
    model: str
    enabled: bool
    default_for_tenant: bool
    priority: int
    rate_limit_rpm: int
    max_tokens: int
    supports_json_schema: bool
    api_key_env_var: str | None = None
    settings: dict[str, Any] | None = None
    last_success_at: datetime | None = None
    error_count: int
    created_at: datetime


# ----------------------------- Budgets ----------------------------------

class BudgetUpdate(BaseModel):
    period: Literal["day", "week", "month"] | None = None
    max_tokens: int | None = None
    max_cost: Decimal | None = None
    soft_warn_at: Decimal | None = None


class BudgetOut(BaseModel):
    id: str
    scope: str
    scope_id: str
    period: str
    max_tokens: int | None = None
    max_cost: Decimal | None = None
    soft_warn_at: Decimal
    hard_stop_at: Decimal
    reset_at: datetime | None = None


class UsageOut(BaseModel):
    scope: str
    scope_id: str
    period: str
    period_start: datetime
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    total_cost: Decimal
    analyses_count: int
    cache_hits: int


# ----------------------------- Cache ------------------------------------

class CacheStats(BaseModel):
    hit_rate: float
    total_keys: int
    estimated_size_bytes: int


# ----------------------------- Operation -------------------------------

class OperationCreated(BaseModel):
    operation_id: str
    status_url: str
