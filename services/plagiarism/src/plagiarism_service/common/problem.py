"""RFC 7807 problem helpers — re-exported from :mod:`plaglens_common.problem`.

The implementation is the single source of truth in ``plaglens_common``; this
module is a thin shim so existing plagiarism call-sites keep working. Note the
local ``ProblemError`` / ``validation_failed`` names map onto the shared
``ProblemException`` / ``validation``.
"""

from __future__ import annotations

from plaglens_common.problem import (
    CONTENT_TYPE_PROBLEM,
    ERROR_CODES,
    Problem,
    ProblemException,
    ProblemFieldError,
    conflict,
    forbidden,
    locked,
    make_handlers,
    not_found,
    problem_response,
    tenant_mismatch,
    unauthenticated,
    upstream_failed,
    upstream_timeout,
)
from plaglens_common.problem import ProblemException as ProblemError
from plaglens_common.problem import validation as validation_failed

ERROR_BASE = "https://docs.plaglens.ru/errors"

__all__ = [
    "CONTENT_TYPE_PROBLEM",
    "ERROR_BASE",
    "ERROR_CODES",
    "Problem",
    "ProblemError",
    "ProblemException",
    "ProblemFieldError",
    "conflict",
    "forbidden",
    "locked",
    "make_handlers",
    "not_found",
    "problem_response",
    "tenant_mismatch",
    "unauthenticated",
    "upstream_failed",
    "upstream_timeout",
    "validation_failed",
]
