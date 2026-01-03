"""RFC 7807 Problem Details for HTTP APIs.

See `docs/architecture/01-CROSS-CUTTING.md` §5.
"""

from __future__ import annotations

import logging
from typing import Any, Final

from pydantic import BaseModel, ConfigDict, Field

from .headers import CONTENT_TYPE_PROBLEM, REQUEST_ID

# fmt: off
ERROR_CODES: Final[dict[str, str]] = {
    "BAD_REQUEST":              "BAD_REQUEST",
    "UNAUTHENTICATED":          "UNAUTHENTICATED",
    "TOKEN_EXPIRED":            "TOKEN_EXPIRED",
    "TOKEN_REVOKED":            "TOKEN_REVOKED",
    "FORBIDDEN":                "FORBIDDEN",
    "TENANT_MISMATCH":          "TENANT_MISMATCH",
    "NOT_FOUND":                "NOT_FOUND",
    "CONFLICT":                 "CONFLICT",
    "IDEMPOTENCY_KEY_CONFLICT": "IDEMPOTENCY_KEY_CONFLICT",
    "GONE":                     "GONE",
    "PAYLOAD_TOO_LARGE":        "PAYLOAD_TOO_LARGE",
    "VALIDATION_FAILED":        "VALIDATION_FAILED",
    "LOCKED":                   "LOCKED",
    "RATE_LIMITED":             "RATE_LIMITED",
    "LEGAL_BLOCKED":            "LEGAL_BLOCKED",
    "INTERNAL":                 "INTERNAL",
    "UPSTREAM_FAILED":          "UPSTREAM_FAILED",
    "SERVICE_UNAVAILABLE":      "SERVICE_UNAVAILABLE",
    "UPSTREAM_TIMEOUT":         "UPSTREAM_TIMEOUT",
    "BUDGET_EXCEEDED":          "BUDGET_EXCEEDED",
}
# fmt: on

# Default mapping HTTP status -> code (used when caller doesn't specify code).
_DEFAULT_CODE_BY_STATUS: Final[dict[int, str]] = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    410: "GONE",
    413: "PAYLOAD_TOO_LARGE",
    422: "VALIDATION_FAILED",
    423: "LOCKED",
    429: "RATE_LIMITED",
    451: "LEGAL_BLOCKED",
    500: "INTERNAL",
    502: "UPSTREAM_FAILED",
    503: "SERVICE_UNAVAILABLE",
    504: "UPSTREAM_TIMEOUT",
}

DEFAULT_TYPE_BASE: Final[str] = "https://docs.plaglens.ru/errors/"

logger = logging.getLogger(__name__)


class ProblemFieldError(BaseModel):
    """One per-field validation error inside `Problem.errors`."""

    model_config = ConfigDict(extra="allow")

    field: str
    code: str
    message: str


class Problem(BaseModel):
    """RFC 7807 Problem Details.

    Wire content-type: `application/problem+json`.
    """

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    type: str = Field(default=DEFAULT_TYPE_BASE + "internal")
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str
    errors: list[ProblemFieldError] | None = None
    request_id: str | None = None

    @classmethod
    def from_status(
        cls,
        status: int,
        *,
        title: str | None = None,
        detail: str | None = None,
        code: str | None = None,
        instance: str | None = None,
        errors: list[ProblemFieldError] | None = None,
        request_id: str | None = None,
        type_uri: str | None = None,
    ) -> Problem:
        resolved_code = code or _DEFAULT_CODE_BY_STATUS.get(status, "INTERNAL")
        resolved_title = title or resolved_code.replace("_", " ").title()
        resolved_type = type_uri or (DEFAULT_TYPE_BASE + resolved_code.lower())
        return cls(
            type=resolved_type,
            title=resolved_title,
            status=status,
            detail=detail,
            instance=instance,
            code=resolved_code,
            errors=errors,
            request_id=request_id,
        )


class ProblemException(Exception):
    """Exception that carries a `Problem` to be rendered by the FastAPI handler."""

    def __init__(self, problem: Problem, *, headers: dict[str, str] | None = None) -> None:
        self.problem = problem
        self.headers = headers or {}
        super().__init__(f"{problem.code}: {problem.title}")

    @classmethod
    def from_status(
        cls,
        status: int,
        *,
        detail: str | None = None,
        code: str | None = None,
        title: str | None = None,
        errors: list[ProblemFieldError] | None = None,
        headers: dict[str, str] | None = None,
    ) -> ProblemException:
        return cls(
            Problem.from_status(
                status, detail=detail, code=code, title=title, errors=errors
            ),
            headers=headers,
        )


def problem_exception_handler(_request: Any, exc: ProblemException) -> Any:
    """FastAPI exception handler factory output.

    Imports `JSONResponse` lazily so the library remains usable without FastAPI installed.
    """
    try:
        from starlette.responses import JSONResponse  # type: ignore[import-not-found]
    except ImportError as imp_err:  # pragma: no cover - happens only without fastapi extra
        raise RuntimeError(
            "FastAPI/Starlette is required for problem_exception_handler"
        ) from imp_err

    headers = dict(exc.headers)
    request_id = getattr(getattr(_request, "state", None), "request_id", None) or headers.get(
        REQUEST_ID
    )
    if request_id and exc.problem.request_id is None:
        exc.problem.request_id = str(request_id)
    if request_id:
        headers.setdefault(REQUEST_ID, str(request_id))

    return JSONResponse(
        status_code=exc.problem.status,
        content=exc.problem.model_dump(exclude_none=True),
        media_type=CONTENT_TYPE_PROBLEM,
        headers=headers,
    )


__all__ = [
    "DEFAULT_TYPE_BASE",
    "ERROR_CODES",
    "Problem",
    "ProblemException",
    "ProblemFieldError",
    "problem_exception_handler",
]
