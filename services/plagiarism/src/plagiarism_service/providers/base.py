"""Provider abstraction.

Concrete providers (today: Dolos) implement this interface
and are dispatched by the orchestrator. The interface mirrors the spec in
``08-PLAGIARISM.md``.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Literal, NewType

ProviderRunId = NewType("ProviderRunId", str)
ProviderStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


@dataclass
class ProviderCapabilities:
    name: str
    languages: list[str]
    max_size_bytes: int = 50 * 1024 * 1024
    supports_clusters: bool = False
    supports_cancel: bool = False
    supports_webhook: bool = False
    polling_interval_seconds: int = 5


@dataclass
class SubmissionFile:
    path: str
    content: str


@dataclass
class SubmissionItem:
    submission_id: str
    author_id: str | None
    author_display_name: str | None
    course_id: str | None
    assignment_id: str | None
    language: str | None
    files: list[SubmissionFile]
    is_corpus: bool = False  # True when item came from CorpusEntry
    cross_course: bool = False
    cross_assignment: bool = False


@dataclass
class SubmissionSet:
    run_id: str
    tenant_id: str
    language: str | None
    options: dict[str, Any]
    items: list[SubmissionItem]


@dataclass
class ResultFragment:
    a_file: str
    a_start_line: int
    a_end_line: int
    b_file: str
    b_start_line: int
    b_end_line: int
    a_content: str | None = None
    b_content: str | None = None


@dataclass
class ResultPair:
    a_submission_id: str
    b_submission_id: str
    similarity: float
    matched_tokens: int = 0
    fragments: list[ResultFragment] = field(default_factory=list)


@dataclass
class ResultCluster:
    members: list[str]
    avg_similarity: float
    dominant_language: str | None = None


@dataclass
class ProviderArtifact:
    kind: str  # "html" | "json" | "archive"
    content: bytes
    content_type: str = "application/octet-stream"
    filename: str | None = None


@dataclass
class ProviderResult:
    status: ProviderStatus
    pairs: list[ResultPair] = field(default_factory=list)
    clusters: list[ResultCluster] = field(default_factory=list)
    artifacts: dict[str, ProviderArtifact] = field(default_factory=dict)
    progress_percent: float | None = None
    error: str | None = None


class PlagiarismProvider(ABC):
    """Abstract base class for all plagiarism providers."""

    name: str
    capabilities: ProviderCapabilities

    @abstractmethod
    async def submit(self, submission_set: SubmissionSet) -> ProviderRunId:
        """Submit the bundle to the provider. Returns the external run id."""

    @abstractmethod
    async def poll(self, run_id: ProviderRunId) -> ProviderResult:
        """Fetch the current state. Result.status is ``completed`` when done."""

    @abstractmethod
    async def cancel(self, run_id: ProviderRunId) -> None:
        """Best-effort cancel."""

    @abstractmethod
    async def fetch_artifact(self, run_id: ProviderRunId, kind: str) -> ProviderArtifact:
        """Download a raw artifact (html / json / archive)."""
