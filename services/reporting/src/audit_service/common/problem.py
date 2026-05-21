"""RFC 7807 problem helpers — re-exported from :mod:`plaglens_common.problem`.

The implementation is the single source of truth in ``plaglens_common``; this
module is a thin shim so existing audit call-sites keep working.
"""

from __future__ import annotations

from plaglens_common.problem import (
    CONTENT_TYPE_PROBLEM,
    ERROR_CODES,
    Problem,
    ProblemException,
    ProblemFieldError,
    make_handlers,
    problem_response,
)

PROBLEM_CONTENT_TYPE = CONTENT_TYPE_PROBLEM
ERROR_BASE = "https://docs.plaglens.ru/errors"

__all__ = [
    "ERROR_BASE",
    "ERROR_CODES",
    "PROBLEM_CONTENT_TYPE",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "make_handlers",
    "problem_response",
]
