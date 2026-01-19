"""Public API for the `plaglens-common` package.

Re-exports the most-used types so call-sites can do
`from plaglens_common import NotFoundError, Problem`.
"""

from __future__ import annotations

from .errors import (
    BudgetExceededError,
    ConflictError,
    ForbiddenError,
    IdempotencyKeyConflictError,
    LockedError,
    NotFoundError,
    PayloadTooLargeError,
    PlagLensError,
    RateLimitError,
    TenantMismatchError,
    TokenExpiredError,
    TokenRevokedError,
    UnauthenticatedError,
    UpstreamFailedError,
    UpstreamTimeoutError,
    ValidationError,
)
from .events import (
    CloudEvent,
    KafkaEventConsumer,
    KafkaEventProducer,
    ProcessedEventStore,
)
from .headers import IDEMPOTENCY_KEY, REQUEST_ID, TENANT_HINT
from .operation import Operation, OperationStatus, operation_response
from .pagination import (
    CursorPagination,
    PaginatedResponse,
    decode_cursor,
    encode_cursor,
    parse_pagination_query,
)
from .problem import (
    ERROR_CODES,
    Problem,
    ProblemException,
    ProblemFieldError,
    make_handlers,
    problem_response,
)
from .rbac import (
    AuthzContext,
    require_course_role,
    require_global_role,
)

__version__ = "0.1.0"

__all__ = [
    "ERROR_CODES",
    "IDEMPOTENCY_KEY",
    "REQUEST_ID",
    "TENANT_HINT",
    "AuthzContext",
    "BudgetExceededError",
    "CloudEvent",
    "ConflictError",
    "CursorPagination",
    "ForbiddenError",
    "IdempotencyKeyConflictError",
    "KafkaEventConsumer",
    "KafkaEventProducer",
    "LockedError",
    "NotFoundError",
    "Operation",
    "OperationStatus",
    "PaginatedResponse",
    "PayloadTooLargeError",
    "PlagLensError",
    "ProcessedEventStore",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "RateLimitError",
    "TenantMismatchError",
    "TokenExpiredError",
    "TokenRevokedError",
    "UnauthenticatedError",
    "UpstreamFailedError",
    "UpstreamTimeoutError",
    "ValidationError",
    "__version__",
    "decode_cursor",
    "encode_cursor",
    "make_handlers",
    "operation_response",
    "parse_pagination_query",
    "problem_response",
    "require_course_role",
    "require_global_role",
]
