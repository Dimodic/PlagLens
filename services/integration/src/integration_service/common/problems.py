"""RFC 7807 problem helpers — thin adapter over :mod:`plaglens_common.problem`.

integration's call-sites use a *positional* ``ProblemException(status_code,
code, title, detail, errors)`` plus a few custom-signature factories. This
module keeps those signatures while delegating to the shared implementation, so
``plaglens_common.make_handlers`` renders them (the local class subclasses the
shared one, so the shared handler catches it).
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

DOC_URL = "https://docs.plaglens.ru/errors"


class ProblemException(_BaseProblemException):
    """Positional-arg adapter over the shared keyword-only ProblemException."""

    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        errors: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(status=status_code, code=code, title=title, detail=detail, errors=errors)


def not_found(resource: str, ident: Any) -> ProblemException:
    return ProblemException(404, "NOT_FOUND", "Not Found", f"{resource} '{ident}' not found")


def forbidden(reason: str = "Forbidden") -> ProblemException:
    return ProblemException(403, "FORBIDDEN", "Forbidden", reason)


def conflict(reason: str) -> ProblemException:
    return ProblemException(409, "CONFLICT", "Conflict", reason)


def validation(detail: str, errors: list[dict[str, Any]] | None = None) -> ProblemException:
    return ProblemException(422, "VALIDATION_FAILED", "Validation Error", detail, errors)


def upstream_failed(provider: str, detail: str) -> ProblemException:
    return ProblemException(502, "UPSTREAM_FAILED", "Upstream Failed", f"{provider}: {detail}")


__all__ = [
    "DOC_URL",
    "ERROR_CODES",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "conflict",
    "forbidden",
    "make_handlers",
    "not_found",
    "upstream_failed",
    "validation",
]
