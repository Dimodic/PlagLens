"""RFC 7807 problem helpers.

``ProblemException`` is a thin positional adapter over
:class:`plaglens_common.problem.ProblemException` (keeps course's call
signature so the ~85 call-sites are unchanged; the shared ``make_handlers``
renders it). ``Problem`` / ``problem_response`` are kept local because course's
idempotency middleware reuses ``problem_response`` directly.
"""

from __future__ import annotations

from fastapi.responses import JSONResponse
from plaglens_common.problem import ProblemException as _BaseProblemException
from plaglens_common.problem import make_handlers
from pydantic import BaseModel, Field

PROBLEM_BASE = "https://docs.plaglens.ru/errors/"
PROBLEM_MEDIA_TYPE = "application/problem+json"


class FieldError(BaseModel):
    field: str
    code: str
    message: str


class Problem(BaseModel):
    type: str = Field(default=f"{PROBLEM_BASE}internal")
    title: str = "Internal error"
    status: int = 500
    detail: str | None = None
    instance: str | None = None
    code: str = "INTERNAL"
    errors: list[FieldError] | None = None
    request_id: str | None = None


_DEFAULT_TITLES = {
    400: "Bad Request",
    401: "Unauthenticated",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    410: "Gone",
    413: "Payload Too Large",
    422: "Validation Failed",
    423: "Locked",
    429: "Rate Limited",
    451: "Legal Blocked",
    500: "Internal Server Error",
    502: "Upstream Failed",
    503: "Service Unavailable",
    504: "Upstream Timeout",
}

_DEFAULT_CODES = {
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


def problem_response(
    *,
    status: int,
    detail: str | None = None,
    code: str | None = None,
    title: str | None = None,
    instance: str | None = None,
    errors: list[FieldError] | None = None,
    request_id: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> JSONResponse:
    code = code or _DEFAULT_CODES.get(status, "INTERNAL")
    payload = Problem(
        type=f"{PROBLEM_BASE}{code.lower()}",
        title=title or _DEFAULT_TITLES.get(status, "Error"),
        status=status,
        detail=detail,
        instance=instance,
        code=code,
        errors=errors,
        request_id=request_id,
    ).model_dump(exclude_none=True)
    headers = {"Content-Type": PROBLEM_MEDIA_TYPE}
    if extra_headers:
        headers.update(extra_headers)
    return JSONResponse(payload, status_code=status, headers=headers)


class ProblemException(_BaseProblemException):
    """Positional adapter over the shared keyword-only ProblemException."""

    def __init__(
        self,
        status_code: int,
        detail: str | None = None,
        code: str | None = None,
        errors: list[FieldError] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(
            status=status_code,
            code=code or _DEFAULT_CODES.get(status_code, "INTERNAL"),
            title=_DEFAULT_TITLES.get(status_code, "Error"),
            detail=detail,
            errors=errors,  # type: ignore[arg-type]
            headers=headers,
        )


__all__ = [
    "PROBLEM_BASE",
    "PROBLEM_MEDIA_TYPE",
    "FieldError",
    "Problem",
    "ProblemException",
    "make_handlers",
    "problem_response",
]
