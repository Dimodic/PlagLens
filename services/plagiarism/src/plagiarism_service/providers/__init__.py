"""Pluggable plagiarism providers."""

from .base import (
    PlagiarismProvider,
    ProviderArtifact,
    ProviderCapabilities,
    ProviderResult,
    ProviderRunId,
    ProviderStatus,
    ResultPair,
    SubmissionFile,
    SubmissionItem,
    SubmissionSet,
)
from .codequiry import CodequiryProvider
from .dolos import DolosProvider
from .jplag import JPlagProvider
from .moss import MossProvider

__all__ = [
    "CodequiryProvider",
    "DolosProvider",
    "JPlagProvider",
    "MossProvider",
    "PlagiarismProvider",
    "ProviderArtifact",
    "ProviderCapabilities",
    "ProviderResult",
    "ProviderRunId",
    "ProviderStatus",
    "ResultPair",
    "SubmissionFile",
    "SubmissionItem",
    "SubmissionSet",
    "get_provider",
]


def get_provider(name: str) -> PlagiarismProvider:
    """Resolve a provider by name. Raises ``ValueError`` if unknown."""
    name = name.lower()
    table: dict[str, type[PlagiarismProvider]] = {
        "jplag": JPlagProvider,
        "moss": MossProvider,
        "codequiry": CodequiryProvider,
        "dolos": DolosProvider,
    }
    cls = table.get(name)
    if cls is None:
        raise ValueError(f"Unknown plagiarism provider: {name}")
    return cls()
