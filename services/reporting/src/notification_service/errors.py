"""RFC 7807 problem objects.

``Problem`` is a thin positional adapter over
:class:`plaglens_common.problem.ProblemException` (keeps notification's
call-sites; the shared ``make_handlers`` renders it). A pydantic
``ValidationError`` handler is kept because the shared handlers only cover
FastAPI's ``RequestValidationError``.
"""

from __future__ import annotations

from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from plaglens_common.problem import ProblemException as _BaseProblemException
from plaglens_common.problem import ProblemFieldError, make_handlers, problem_response
from pydantic import ValidationError

PROBLEM_DOCS_BASE = "https://docs.plaglens.ru/errors"


class Problem(_BaseProblemException):
    """Positional adapter over the shared keyword-only ProblemException."""

    def __init__(
        self,
        status_code: int,
        code: str,
        title: str,
        detail: str | None = None,
        type_slug: str | None = None,
        errors: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(
            status=status_code,
            code=code,
            title=title,
            detail=detail,
            type_=f"{PROBLEM_DOCS_BASE}/{type_slug}" if type_slug else None,
            errors=errors,
        )


async def pydantic_validation_handler(request: Request, exc: ValidationError) -> JSONResponse:
    errors = [
        ProblemFieldError(
            field=".".join(str(x) for x in e.get("loc", [])),
            code=str(e.get("type", "invalid")),
            message=str(e.get("msg", "")),
        )
        for e in exc.errors()
    ]
    return problem_response(
        request,
        status=422,
        code="VALIDATION_FAILED",
        title="Validation Error",
        detail="Validation failed",
        errors=errors,
    )


__all__ = ["PROBLEM_DOCS_BASE", "Problem", "make_handlers", "pydantic_validation_handler"]
