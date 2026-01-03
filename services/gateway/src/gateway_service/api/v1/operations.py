"""Universal `/v1/operations` dispatcher.

Routes:
    GET  /v1/operations              — list (fan-out across all op-owning backends)
    GET  /v1/operations/{op_id}      — read (dispatched by op_id prefix)
    POST /v1/operations/{op_id}:cancel — cancel
"""

from __future__ import annotations

import asyncio

import httpx
from fastapi import APIRouter, Path, Request
from fastapi.responses import JSONResponse

from gateway_service.errors import problem_response
from gateway_service.operations.dispatcher import (
    all_operation_backends,
    backend_url_for,
)
from gateway_service.proxy.forwarder import forward
from gateway_service.proxy.http_client import get_http_client

router = APIRouter()


@router.get("/v1/operations/{op_id}", tags=["operations"])
async def get_operation(
    request: Request, op_id: str = Path(..., min_length=4, max_length=128)
):
    resolved = backend_url_for(op_id)
    if resolved is None:
        return problem_response(
            status=404,
            code="NOT_FOUND",
            title="Not Found",
            detail=f"Unknown operation_id prefix: {op_id}",
            request=request,
        )
    backend, base = resolved
    target_path = f"/api/v1/operations/{op_id}"
    return await forward(
        request,
        backend=backend,
        backend_base_url=base,
        principal=getattr(request.state, "principal", None),
        target_path=target_path,
    )


@router.post("/v1/operations/{op_id}:cancel", tags=["operations"])
async def cancel_operation(
    request: Request, op_id: str = Path(..., min_length=4, max_length=128)
):
    resolved = backend_url_for(op_id)
    if resolved is None:
        return problem_response(
            status=404,
            code="NOT_FOUND",
            title="Not Found",
            detail=f"Unknown operation_id prefix: {op_id}",
            request=request,
        )
    backend, base = resolved
    target_path = f"/api/v1/operations/{op_id}:cancel"
    return await forward(
        request,
        backend=backend,
        backend_base_url=base,
        principal=getattr(request.state, "principal", None),
        target_path=target_path,
    )


@router.get("/v1/operations", tags=["operations"])
async def list_operations(request: Request) -> JSONResponse:
    """Fan out a `GET /api/v1/operations` to every op-owning backend, merge results.

    Each backend already filters by user (via X-User-Id / JWT). Gateway just
    concatenates `data` and reports per-backend errors as `degraded` entries.
    """
    backends = all_operation_backends()
    if not backends:
        return JSONResponse(content={"data": [], "pagination": {}}, status_code=200)
    client = get_http_client()
    qs = request.url.query
    suffix = f"?{qs}" if qs else ""
    rid = getattr(request.state, "request_id", None)
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() in {"authorization", "accept-language", "x-tenant-hint"}
    }
    if rid:
        headers["X-Request-Id"] = rid
    principal = getattr(request.state, "principal", None)
    if principal and principal.tenant_id:
        headers["X-Tenant-Id"] = principal.tenant_id
    if principal and principal.user_id:
        headers["X-User-Id"] = principal.user_id

    async def _fetch(name: str, base: str) -> tuple[str, dict]:
        url = base.rstrip("/") + "/api/v1/operations" + suffix
        try:
            r = await client.get(url, headers=headers, timeout=httpx.Timeout(5.0, connect=2.0))
            if r.status_code == 200:
                return name, r.json()
            return name, {"data": [], "_error": {"status": r.status_code}}
        except Exception as e:
            return name, {"data": [], "_error": {"type": type(e).__name__}}

    results = await asyncio.gather(*[_fetch(n, b) for n, b in backends])
    merged: list[dict] = []
    errors: dict[str, dict] = {}
    for name, payload in results:
        if "_error" in payload:
            errors[name] = payload["_error"]
        for item in payload.get("data", []) or []:
            merged.append(item)
    body = {
        "data": merged,
        "pagination": {"has_more": False, "next_cursor": None, "limit": len(merged)},
    }
    if errors:
        body["partial_errors"] = errors
    return JSONResponse(content=body, status_code=200)


__all__ = ["router"]
