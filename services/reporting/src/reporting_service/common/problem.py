"""RFC 7807 problem helpers.

``Problem`` is a thin positional adapter over
:class:`plaglens_common.problem.ProblemException` (keeps reporting's call
signature + factories; the shared ``make_handlers`` renders it).
"""

from __future__ import annotations

from typing import Any

from plaglens_common.problem import ProblemException as _BaseProblemException
from plaglens_common.problem import make_handlers

PROBLEM_BASE = "https://docs.plaglens.ru/errors/"


class Problem(_BaseProblemException):
    """Positional adapter over the shared keyword-only ProblemException."""

    def __init__(
        self,
        status: int,
        code: str,
        title: str,
        detail: str | None = None,
        type_suffix: str | None = None,
        errors: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status=status,
            code=code,
            title=title,
            detail=detail,
            type_=f"{PROBLEM_BASE}{type_suffix}" if type_suffix else None,
            errors=errors,
            headers=headers,
        )


def not_found(detail: str = "Resource not found") -> Problem:
    return Problem(404, "NOT_FOUND", "Not Found", detail)


def forbidden(detail: str = "Forbidden") -> Problem:
    return Problem(403, "FORBIDDEN", "Forbidden", detail)


def unauthenticated(detail: str = "Missing or invalid token") -> Problem:
    return Problem(401, "UNAUTHENTICATED", "Unauthenticated", detail)


def validation_failed(detail: str, errors: list[dict[str, Any]] | None = None) -> Problem:
    return Problem(422, "VALIDATION_FAILED", "Validation Error", detail, errors=errors)


def conflict(code: str, detail: str) -> Problem:
    return Problem(409, code, "Conflict", detail)


def tenant_mismatch() -> Problem:
    return Problem(403, "TENANT_MISMATCH", "Tenant mismatch", "Resource belongs to another tenant")


def internal(detail: str = "Internal server error") -> Problem:
    return Problem(500, "INTERNAL", "Internal", detail)


__all__ = [
    "PROBLEM_BASE",
    "Problem",
    "conflict",
    "forbidden",
    "internal",
    "make_handlers",
    "not_found",
    "tenant_mismatch",
    "unauthenticated",
    "validation_failed",
]
