"""Universal proxy fallback for `/api/v1/*` routes.

Resolves the path through the routing table, then forwards via `forwarder.forward`.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from gateway_service.errors import problem_response
from gateway_service.proxy.forwarder import forward
from gateway_service.routing.dispatcher import resolve

router = APIRouter()


_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"]


@router.api_route("/api/v1/{full_path:path}", methods=_METHODS, include_in_schema=False)
async def universal_proxy(request: Request, full_path: str):
    path = request.url.path
    res = resolve(path)
    if res is None:
        return problem_response(
            status=404,
            code="NOT_FOUND",
            title="Not Found",
            detail=f"No route configured for {path}",
            request=request,
        )
    route, base = res
    body = getattr(request.state, "cached_body", None)
    return await forward(
        request,
        backend=route.backend,
        backend_base_url=base,
        principal=getattr(request.state, "principal", None),
        body=body,
    )


__all__ = ["router"]
