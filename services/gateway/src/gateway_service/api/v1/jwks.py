"""GET /v1/.well-known/jwks.json — proxies to Identity Service."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from gateway_service.errors import problem_response
from gateway_service.jwks import get_jwks

router = APIRouter()


@router.get("/v1/.well-known/jwks.json", tags=["auth"])
async def jwks_proxy(request: Request) -> JSONResponse:
    try:
        doc = await get_jwks()
    except Exception:
        return problem_response(
            status=503,
            code="SERVICE_UNAVAILABLE",
            title="Service Unavailable",
            detail="JWKS unavailable",
            request=request,
        )
    return JSONResponse(content=doc, status_code=200)


__all__ = ["router"]
