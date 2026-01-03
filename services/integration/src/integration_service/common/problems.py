"""RFC 7807 Problem helper.

Service-specific adapter that re-uses the shared error-code catalog from
:mod:`plaglens_common.problem`.  Keeps the local factory helpers
(:func:`not_found`, :func:`forbidden`, ...) used by routers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse

# Import shared error codes from plaglens_common (single source of truth).
from plaglens_common.problem import ERROR_CODES as _SHARED_ERROR_CODES  # noqa: F401

DOC_URL = "https://docs.plaglens.ru/errors"


def problem_response(
    status: int,
    code: str,
    title: str,
    detail: Optional[str] = None,
    instance: Optional[str] = None,
    errors: Optional[List[Dict[str, Any]]] = None,
    request_id: Optional[str] = None,
) -> JSONResponse:
    body: Dict[str, Any] = {
        "type": f"{DOC_URL}/{code.lower()}",
        "title": title,
        "status": status,
        "code": code,
    }
    if detail:
        body["detail"] = detail
    if instance:
        body["instance"] = instance
    if errors:
        body["errors"] = errors
    if request_id:
        body["request_id"] = request_id
    return JSONResponse(
        status_code=status,
        content=body,
        media_type="application/problem+json",
    )


class ProblemException(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: Optional[str] = None,
        errors: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        self.code = code
        self.title = title
        self.errors = errors or []
        self.problem_detail = detail
        super().__init__(status_code=status_code, detail=detail or title)


def not_found(resource: str, ident: Any) -> ProblemException:
    return ProblemException(
        status_code=404,
        code="NOT_FOUND",
        title="Not Found",
        detail=f"{resource} '{ident}' not found",
    )


def forbidden(reason: str = "Forbidden") -> ProblemException:
    return ProblemException(status_code=403, code="FORBIDDEN", title="Forbidden", detail=reason)


def conflict(reason: str) -> ProblemException:
    return ProblemException(status_code=409, code="CONFLICT", title="Conflict", detail=reason)


def validation(detail: str, errors: Optional[List[Dict[str, Any]]] = None) -> ProblemException:
    return ProblemException(
        status_code=422,
        code="VALIDATION_FAILED",
        title="Validation Error",
        detail=detail,
        errors=errors,
    )


def upstream_failed(provider: str, detail: str) -> ProblemException:
    return ProblemException(
        status_code=502,
        code="UPSTREAM_FAILED",
        title="Upstream Failed",
        detail=f"{provider}: {detail}",
    )
