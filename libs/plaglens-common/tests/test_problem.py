from __future__ import annotations

from plaglens_common.problem import (
    ERROR_CODES,
    Problem,
    ProblemException,
    ProblemFieldError,
)


def test_error_codes_have_required_keys() -> None:
    for required in (
        "BAD_REQUEST",
        "UNAUTHENTICATED",
        "TOKEN_EXPIRED",
        "TOKEN_REVOKED",
        "FORBIDDEN",
        "TENANT_MISMATCH",
        "NOT_FOUND",
        "CONFLICT",
        "IDEMPOTENCY_KEY_CONFLICT",
        "VALIDATION_FAILED",
        "RATE_LIMITED",
        "INTERNAL",
        "BUDGET_EXCEEDED",
    ):
        assert required in ERROR_CODES


def test_problem_from_status_defaults() -> None:
    p = Problem.from_status(404)
    assert p.status == 404
    assert p.code == "NOT_FOUND"
    assert "not-found" in p.type or "not_found" in p.type or "notfound" in p.type.lower()


def test_problem_from_status_with_field_errors() -> None:
    err = ProblemFieldError(field="email", code="invalid_format", message="bad")
    p = Problem.from_status(422, errors=[err], detail="invalid")
    dumped = p.model_dump(exclude_none=True)
    assert dumped["errors"][0]["field"] == "email"
    assert dumped["status"] == 422


def test_problem_exception_carries_problem() -> None:
    exc = ProblemException.from_status(409, code="CONFLICT", detail="dup")
    assert exc.problem.status == 409
    assert exc.problem.code == "CONFLICT"
    assert "CONFLICT" in str(exc)


def test_problem_unknown_status_falls_back_to_internal() -> None:
    p = Problem.from_status(599)
    assert p.code == "INTERNAL"
