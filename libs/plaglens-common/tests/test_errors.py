from __future__ import annotations

import pytest

from plaglens_common.errors import (
    BudgetExceededError,
    ConflictError,
    ForbiddenError,
    IdempotencyKeyConflictError,
    NotFoundError,
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


@pytest.mark.parametrize(
    "cls,status,code",
    [
        (NotFoundError, 404, "NOT_FOUND"),
        (ConflictError, 409, "CONFLICT"),
        (ValidationError, 422, "VALIDATION_FAILED"),
        (UnauthenticatedError, 401, "UNAUTHENTICATED"),
        (ForbiddenError, 403, "FORBIDDEN"),
        (TenantMismatchError, 403, "TENANT_MISMATCH"),
        (RateLimitError, 429, "RATE_LIMITED"),
        (BudgetExceededError, 402, "BUDGET_EXCEEDED"),
        (UpstreamFailedError, 502, "UPSTREAM_FAILED"),
        (UpstreamTimeoutError, 504, "UPSTREAM_TIMEOUT"),
        (IdempotencyKeyConflictError, 409, "IDEMPOTENCY_KEY_CONFLICT"),
        (TokenExpiredError, 401, "TOKEN_EXPIRED"),
        (TokenRevokedError, 401, "TOKEN_REVOKED"),
    ],
)
def test_to_problem_maps_status_and_code(cls: type[PlagLensError], status: int, code: str) -> None:
    p = cls("oops").to_problem()
    assert p.status == status
    assert p.code == code
    assert p.detail == "oops"


def test_to_exception_wraps_into_problem_exception() -> None:
    err = NotFoundError("missing")
    pe = err.to_exception()
    assert pe.status == 404
    assert pe.code == "NOT_FOUND"
