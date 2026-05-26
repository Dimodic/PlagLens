"""Pluggable plagiarism providers.

Only Dolos is shipped as a working implementation. The ``PlagiarismProvider``
abstract base + the registry below stay in place so adding another engine
is a matter of dropping in one more subclass —
no orchestrator-side changes required.
"""

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
from .dolos import DolosProvider

__all__ = [
    "DolosProvider",
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
        "dolos": DolosProvider,
    }
    cls = table.get(name)
    if cls is None:
        raise ValueError(f"Unknown plagiarism provider: {name}")
    return cls()
