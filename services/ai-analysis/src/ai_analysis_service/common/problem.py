"""RFC 7807 Problem Details helpers.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401
from pydantic import BaseModel

DOC_BASE = "https://docs.plaglens.ru/errors"


class Problem(BaseModel):
    type: str
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str
    errors: list[dict[str, Any]] | None = None
    request_id: str | None = None


class ProblemException(HTTPException):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        errors: list[dict[str, Any]] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail or title, headers=headers)
        self.problem_code = code
        self.problem_title = title
        self.problem_detail = detail
        self.problem_errors = errors


def problem_response(request: Request, exc: ProblemException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    body = Problem(
        type=f"{DOC_BASE}/{exc.problem_code.lower()}",
        title=exc.problem_title,
        status=exc.status_code,
        detail=exc.problem_detail,
        instance=str(request.url.path),
        code=exc.problem_code,
        errors=exc.problem_errors,
        request_id=request_id,
    ).model_dump(exclude_none=True)
    headers = exc.headers or {}
    if request_id:
        headers["X-Request-Id"] = request_id
    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        media_type="application/problem+json",
        headers=headers,
    )


def not_found(detail: str = "Resource not found") -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_404_NOT_FOUND,
        code="NOT_FOUND",
        title="Not Found",
        detail=detail,
    )


def forbidden(detail: str = "Forbidden") -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_403_FORBIDDEN,
        code="FORBIDDEN",
        title="Forbidden",
        detail=detail,
    )


def validation(detail: str, errors: list[dict[str, Any]] | None = None) -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="VALIDATION_FAILED",
        title="Validation Error",
        detail=detail,
        errors=errors,
    )


def conflict(detail: str, code: str = "CONFLICT") -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_409_CONFLICT,
        code=code,
        title="Conflict",
        detail=detail,
    )


def budget_exceeded(detail: str) -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        code="BUDGET_EXCEEDED",
        title="Budget Exceeded",
        detail=detail,
        headers={"Retry-After": "3600"},
    )


def rate_limited(detail: str = "Rate limited") -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        code="RATE_LIMITED",
        title="Too Many Requests",
        detail=detail,
        headers={"Retry-After": "60"},
    )


def upstream_failed(detail: str) -> ProblemException:
    return ProblemException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        code="UPSTREAM_FAILED",
        title="Upstream Failed",
        detail=detail,
    )
