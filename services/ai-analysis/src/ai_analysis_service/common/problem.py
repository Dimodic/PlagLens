"""RFC 7807 problem helpers — re-exported from :mod:`plaglens_common.problem`.

The implementation is the single source of truth in ``plaglens_common``; this
module is a thin shim so existing ai-analysis call-sites keep working.
"""

from __future__ import annotations

from plaglens_common.problem import (
    CONTENT_TYPE_PROBLEM,
    ERROR_CODES,
    Problem,
    ProblemException,
    ProblemFieldError,
    bad_request,
    budget_exceeded,
    conflict,
    forbidden,
    make_handlers,
    not_found,
    problem_response,
    rate_limited,
    unauthenticated,
    upstream_failed,
    validation,
)

DOC_BASE = "https://docs.plaglens.ru/errors"
PROBLEM_CONTENT_TYPE = CONTENT_TYPE_PROBLEM

__all__ = [
    "CONTENT_TYPE_PROBLEM",
    "DOC_BASE",
    "ERROR_CODES",
    "PROBLEM_CONTENT_TYPE",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "bad_request",
    "budget_exceeded",
    "conflict",
    "forbidden",
    "make_handlers",
    "not_found",
    "problem_response",
    "rate_limited",
    "unauthenticated",
    "upstream_failed",
    "validation",
]
