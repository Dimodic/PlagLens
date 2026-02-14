"""RFC 7807 problem helpers — thin adapter over :mod:`plaglens_common.problem`.

submission's call-sites use a *positional* ``ProblemException(status_code,
code, title, detail)`` plus local factories. This keeps those signatures while
the shared module provides the ``Problem`` model and the exception handlers
(the local class subclasses the shared one, so ``make_handlers`` catches it).
"""

from __future__ import annotations

from typing import Any

from plaglens_common.problem import (
    ERROR_CODES,
    Problem,
    ProblemFieldError,
    make_handlers,
)
from plaglens_common.problem import ProblemException as _BaseProblemException


class ProblemException(_BaseProblemException):
    """Positional-arg adapter over the shared keyword-only ProblemException."""

    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        *,
        errors: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(status=status_code, code=code, title=title, detail=detail, errors=errors)


def not_found(detail: str = "Resource not found") -> ProblemException:
    return ProblemException(404, "NOT_FOUND", "Not Found", detail)


def forbidden(detail: str = "Forbidden") -> ProblemException:
    return ProblemException(403, "FORBIDDEN", "Forbidden", detail)


def unauthenticated(detail: str = "Authentication required") -> ProblemException:
    return ProblemException(401, "UNAUTHENTICATED", "Unauthenticated", detail)


def conflict(detail: str = "Conflict", code: str = "CONFLICT") -> ProblemException:
    return ProblemException(409, code, "Conflict", detail)


def validation_error(detail: str, errors: list[dict[str, Any]] | None = None) -> ProblemException:
    return ProblemException(422, "VALIDATION_FAILED", "Validation Error", detail, errors=errors)


def payload_too_large(detail: str = "Payload too large") -> ProblemException:
    return ProblemException(413, "PAYLOAD_TOO_LARGE", "Payload Too Large", detail)


__all__ = [
    "ERROR_CODES",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "conflict",
    "forbidden",
    "make_handlers",
    "not_found",
    "payload_too_large",
    "unauthenticated",
    "validation_error",
]
