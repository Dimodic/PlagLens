"""Schemas for runs / pairs / clusters / report (§A, §B, §G)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from .common import ArtifactLink, AuthorRef

RunStatusEnum = Literal["queued", "running", "completed", "failed", "cancelled"]


class RunOptions(BaseModel):
    min_tokens: int = 9
    similarity_threshold: float = 0.6
    include_versions: Literal["selected", "all_versions", "latest_per_student"] = "latest_per_student"
    languages_filter: list[str] = Field(default_factory=list)
    extra: dict[str, Any] = Field(default_factory=dict)


class RunCreate(BaseModel):
    provider: str | None = None
    with_corpus: bool = False
    options: dict[str, Any] = Field(default_factory=dict)
    submission_ids: list[str] | None = None  # if scope == explicit


class RunSummary(BaseModel):
    max_similarity: float | None = None
    mean_similarity: float | None = None
    pairs_total: int = 0
    pairs_suspected: int = 0
    clusters_count: int = 0
    languages: dict[str, int] = Field(default_factory=dict)


class RunListItem(BaseModel):
    id: str
    tenant_id: str
    course_id: str | None = None
    assignment_id: str | None = None
    provider: str
    status: RunStatusEnum
    trigger: str = "manual"
    submissions_count: int = 0
    pairs_total: int = 0
    pairs_suspected: int = 0
    max_similarity: float | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class RunDetail(RunListItem):
    scope: dict[str, Any] = Field(default_factory=dict)
    options: dict[str, Any] = Field(default_factory=dict)
    triggered_by: str | None = None
    error: dict[str, Any] | None = None
    artifacts: ArtifactLink = Field(default_factory=ArtifactLink)


class RunReport(BaseModel):
    run_id: str
    assignment_id: str | None
    provider: str
    status: RunStatusEnum
    submissions_count: int
    summary: RunSummary
    started_at: datetime | None
    finished_at: datetime | None
    options_used: dict[str, Any] = Field(default_factory=dict)
    artifacts: ArtifactLink = Field(default_factory=ArtifactLink)


class PairListItem(BaseModel):
    id: str
    a_submission_id: str
    b_submission_id: str
    a_author: AuthorRef = Field(default_factory=AuthorRef)
    b_author: AuthorRef = Field(default_factory=AuthorRef)
    similarity: float
    matched_tokens: int = 0
    fragments_count: int = 0
    cross_course: bool = False
    cross_assignment: bool = False
    evidence_url: str | None = None


class PairFragment(BaseModel):
    a_file: str
    a_start_line: int
    a_end_line: int
    b_file: str
    b_start_line: int
    b_end_line: int
    a_content: str | None = None
    b_content: str | None = None


class PairDetail(BaseModel):
    id: str
    run_id: str
    similarity: float
    matched_tokens: int
    fragments: list[PairFragment]
    submissions: dict[str, Any] = Field(default_factory=dict)


class ClusterListItem(BaseModel):
    id: str
    members: list[str]
    # Resolved student identities for ``members``, in the same order.
    # Populated from the run's ``author_map`` snapshot so the UI can
    # show real names + initials instead of raw ``sub_xxx`` IDs.
    member_authors: list[AuthorRef] = Field(default_factory=list)
    avg_similarity: float
    dominant_language: str | None = None


class ClusterDetail(ClusterListItem):
    run_id: str


class PlagiarismConfig(BaseModel):
    assignment_id: str
    provider: str | None = None
    threshold: float = 0.6
    auto_run: bool = False
    with_corpus: bool = False
    languages_filter: list[str] = Field(default_factory=list)
    options: dict[str, Any] = Field(default_factory=dict)


class PlagiarismConfigUpdate(BaseModel):
    provider: str | None = None
    threshold: float | None = None
    auto_run: bool | None = None
    with_corpus: bool | None = None
    languages_filter: list[str] | None = None
    options: dict[str, Any] | None = None
