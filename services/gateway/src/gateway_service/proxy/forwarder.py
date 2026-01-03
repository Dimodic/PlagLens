"""Forward an incoming Starlette/FastAPI request to a backend service."""

from __future__ import annotations

from typing import Any

import httpx
from starlette.requests import Request
from starlette.responses import Response

from gateway_service.auth import Principal
from gateway_service.circuit_breaker import breaker
from gateway_service.errors import problem_response
from gateway_service.metrics import backend_errors_total
from gateway_service.proxy.headers import inject_forward_headers, strip_hop_by_hop
from gateway_service.proxy.http_client import get_http_client


async def forward(
    request: Request,
    *,
    backend: str,
    backend_base_url: str,
    principal: Principal | None,
    target_path: str | None = None,
    body: bytes | None = None,
) -> Response:
    """Forward `request` to `backend_base_url + target_path`.

    `target_path` defaults to `request.url.path`. Query string preserved.
    Returns the proxied response with hop-by-hop stripped.
    """
    if not await breaker.allow(backend):
        return problem_response(
            status=503,
            code="SERVICE_UNAVAILABLE",
            title="Service Unavailable",
            detail=f"Backend '{backend}' is unavailable",
            request=request,
            headers={"Retry-After": "60"},
        )

    path = target_path if target_path is not None else request.url.path
    qs = request.url.query
    url = backend_base_url.rstrip("/") + path + (f"?{qs}" if qs else "")

    headers_in: list[tuple[str, str]] = [(k.decode(), v.decode()) for k, v in request.headers.raw]
    headers_in = strip_hop_by_hop(headers_in)
    rid = getattr(request.state, "request_id", None)
    client_ip = request.client.host if request.client else None
    headers_out = inject_forward_headers(
        headers_in, request_id=rid, principal=principal, client_ip=client_ip
    )

    if body is None:
        body = await request.body()

    client = get_http_client()
    method = request.method.upper()
    # SECURITY: clear the shared client's cookie jar **before** every forward.
    # httpx persists Set-Cookie response headers automatically and re-sends
    # them on subsequent requests. In a reverse-proxy this leaks one user's
    # cookies to the next caller (full auth bypass on /auth/refresh, since
    # __Host-refresh from one user's login response gets attached to the
    # next anonymous /refresh forward). The original client's Cookie header
    # is already in headers_out, so this clear is safe.
    client.cookies.clear()
    try:
        resp = await client.request(
            method=method,
            url=url,
            content=body if body else None,
            headers=headers_out,
        )
    except httpx.TimeoutException as e:
        backend_errors_total.labels(backend=backend, error_type="timeout").inc()
        await breaker.record(backend, success=False)
        return problem_response(
            status=504,
            code="UPSTREAM_TIMEOUT",
            title="Gateway Timeout",
            detail=str(e),
            request=request,
        )
    except httpx.HTTPError as e:
        backend_errors_total.labels(backend=backend, error_type="connect").inc()
        await breaker.record(backend, success=False)
        return problem_response(
            status=502,
            code="UPSTREAM_FAILED",
            title="Bad Gateway",
            detail=type(e).__name__,
            request=request,
        )

    is_failure = resp.status_code >= 500
    await breaker.record(backend, success=not is_failure)
    if is_failure:
        backend_errors_total.labels(backend=backend, error_type=str(resp.status_code)).inc()

    out_headers: list[tuple[bytes, bytes]] = []
    for k, v in strip_hop_by_hop(list(resp.headers.items())):
        out_headers.append((k.lower().encode(), v.encode()))
    if rid:
        out_headers.append((b"x-request-id", rid.encode()))

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        headers={k.decode(): v.decode() for k, v in out_headers},
        media_type=resp.headers.get("content-type"),
    )


def _ensure_unused() -> Any:  # pragma: no cover
    return None


__all__ = ["forward"]
