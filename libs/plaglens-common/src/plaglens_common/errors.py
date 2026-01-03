"""Generic domain exceptions exposed to services.

Each exception carries enough context to render an RFC 7807 `Problem`.
Services raise these inside business logic; FastAPI handlers convert them via
`problem_exception_handler`. Each has a `.to_problem()` method.
"""

from __future__ import annotations

from typing import Any

from .problem import Problem, ProblemException, ProblemFieldError


class PlagLensError(Exception):
    """Base for all PlagLens domain errors."""

    status: int = 500
    code: str = "INTERNAL"
    default_title: str = "Internal Error"

    def __init__(
        self,
        detail: str | None = None,
        *,
        errors: list[ProblemFieldError] | None = None,
        instance: str | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.detail = detail
        self.errors = errors
        self.instance = instance
        self.extra = extra or {}
        super().__init__(detail or self.default_title)

    def to_problem(self) -> Problem:
        return Problem.from_status(
            self.status,
            title=self.default_title,
            detail=self.detail,
            code=self.code,
            errors=self.errors,
            instance=self.instance,
        )

    def to_exception(self) -> ProblemException:
        return ProblemException(self.to_problem())


class NotFoundError(PlagLensError):
    status = 404
    code = "NOT_FOUND"
    default_title = "Not Found"


class ConflictError(PlagLensError):
    status = 409
    code = "CONFLICT"
    default_title = "Conflict"


class ValidationError(PlagLensError):
    status = 422
    code = "VALIDATION_FAILED"
    default_title = "Validation Failed"


class UnauthenticatedError(PlagLensError):
    status = 401
    code = "UNAUTHENTICATED"
    default_title = "Unauthenticated"


class ForbiddenError(PlagLensError):
    status = 403
    code = "FORBIDDEN"
    default_title = "Forbidden"


class TenantMismatchError(PlagLensError):
    status = 403
    code = "TENANT_MISMATCH"
    default_title = "Tenant Mismatch"


class RateLimitError(PlagLensError):
    status = 429
    code = "RATE_LIMITED"
    default_title = "Rate Limited"


class BudgetExceededError(PlagLensError):
    status = 402  # closest semantic match; spec uses 422 "BUDGET_EXCEEDED" code-wise
    code = "BUDGET_EXCEEDED"
    default_title = "Budget Exceeded"


class UpstreamFailedError(PlagLensError):
    status = 502
    code = "UPSTREAM_FAILED"
    default_title = "Upstream Failed"


class UpstreamTimeoutError(PlagLensError):
    status = 504
    code = "UPSTREAM_TIMEOUT"
    default_title = "Upstream Timeout"


class IdempotencyKeyConflictError(PlagLensError):
    status = 409
    code = "IDEMPOTENCY_KEY_CONFLICT"
    default_title = "Idempotency Key Conflict"


class LockedError(PlagLensError):
    status = 423
    code = "LOCKED"
    default_title = "Locked"


class PayloadTooLargeError(PlagLensError):
    status = 413
    code = "PAYLOAD_TOO_LARGE"
    default_title = "Payload Too Large"


class TokenExpiredError(UnauthenticatedError):
    code = "TOKEN_EXPIRED"
    default_title = "Token Expired"


class TokenRevokedError(UnauthenticatedError):
    code = "TOKEN_REVOKED"
    default_title = "Token Revoked"


__all__ = [
    "BudgetExceededError",
    "ConflictError",
    "ForbiddenError",
    "IdempotencyKeyConflictError",
    "LockedError",
    "NotFoundError",
    "PayloadTooLargeError",
    "PlagLensError",
    "RateLimitError",
    "TenantMismatchError",
    "TokenExpiredError",
    "TokenRevokedError",
    "UnauthenticatedError",
    "UpstreamFailedError",
    "UpstreamTimeoutError",
    "ValidationError",
]
