"""Pydantic v2 request/response schemas for the plagiarism service API."""

from .common import (
    ArtifactLink,
    AuthorRef,
    OperationCreated,
    PageInfo,
)
from .corpus import (
    CorpusEntryItem,
    CorpusRebuildResponse,
    CorpusSearchHit,
    CorpusSearchRequest,
    CorpusSearchResponse,
    CorpusStats,
)
from .providers import (
    ProviderAdmin,
    ProviderTestResponse,
    ProviderUpdate,
    ProviderUsage,
)
from .runs import (
    ClusterDetail,
    ClusterListItem,
    PairDetail,
    PairFragment,
    PairListItem,
    PlagiarismConfig,
    PlagiarismConfigUpdate,
    RunCreate,
    RunDetail,
    RunListItem,
    RunReport,
    RunStatusEnum,
    RunSummary,
)
from .submission_view import (
    SubmissionPercentage,
    SubmissionPlagiarismLatest,
)
from .suspicious import (
    SuspiciousFlagCreate,
    SuspiciousFlagDismiss,
    SuspiciousFlagItem,
)
from .webhooks import (
    WebhookSubscriptionCreate,
    WebhookSubscriptionItem,
)

__all__ = [
    "ArtifactLink",
    "AuthorRef",
    "ClusterDetail",
    "ClusterListItem",
    "CorpusEntryItem",
    "CorpusRebuildResponse",
    "CorpusSearchHit",
    "CorpusSearchRequest",
    "CorpusSearchResponse",
    "CorpusStats",
    "OperationCreated",
    "PageInfo",
    "PairDetail",
    "PairFragment",
    "PairListItem",
    "PlagiarismConfig",
    "PlagiarismConfigUpdate",
    "ProviderAdmin",
    "ProviderTestResponse",
    "ProviderUpdate",
    "ProviderUsage",
    "RunCreate",
    "RunDetail",
    "RunListItem",
    "RunReport",
    "RunStatusEnum",
    "RunSummary",
    "SubmissionPercentage",
    "SubmissionPlagiarismLatest",
    "SuspiciousFlagCreate",
    "SuspiciousFlagDismiss",
    "SuspiciousFlagItem",
    "WebhookSubscriptionCreate",
    "WebhookSubscriptionItem",
]
