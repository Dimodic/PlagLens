"""POST /api/v1/_debug/client-errors — receive frontend errors and log them.

This endpoint is intentionally **public** (no JWT) so that errors that occur
on the login/register pages or before authentication can also be captured.

Errors are logged via structlog so they appear in `docker logs plaglens-gateway`
and can be tailed in real time:

    docker logs plaglens-gateway -f --since 1m | grep client_error
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

logger = structlog.get_logger("client_error")

router = APIRouter(prefix="/api/v1/_debug", tags=["debug"])


class ClientError(BaseModel):
    """Schema for a single client-side error report."""

    type: str = Field(
        description="window_error | unhandled_rejection | console | network | react | manual"
    )
    message: str = Field(max_length=4000)
    stack: str | None = Field(default=None, max_length=20_000)
    url: str | None = Field(default=None, max_length=2000)
    user_agent: str | None = Field(default=None, max_length=512)
    role: str | None = Field(default=None, max_length=64)
    extra: dict[str, Any] | None = None


@router.post("/client-errors", status_code=204)
async def log_client_error(error: ClientError, request: Request) -> None:
    """Accept and log a client-side error.

    Returns 204 No Content. Never fails — even malformed payloads are caught
    by FastAPI and rejected with 422, but valid payloads always succeed.
    """
    logger.error(
        "client_error",
        type=error.type,
        message=error.message,
        stack=error.stack,
        url=error.url,
        user_agent=error.user_agent or request.headers.get("user-agent"),
        role=error.role,
        client_ip=request.client.host if request.client else None,
        extra=error.extra,
    )


__all__ = ["router"]
