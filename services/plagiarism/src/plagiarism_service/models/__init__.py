"""SQLAlchemy ORM models for the plagiarism service (schema=plagiarism)."""

from .base import Base
from .plagiarism import (
    CorpusEntry,
    PlagiarismCluster,
    PlagiarismPair,
    PlagiarismRun,
    ProviderConfig,
    SuspiciousFlag,
    WebhookSubscription,
)

__all__ = [
    "Base",
    "CorpusEntry",
    "PlagiarismCluster",
    "PlagiarismPair",
    "PlagiarismRun",
    "ProviderConfig",
    "SuspiciousFlag",
    "WebhookSubscription",
]
