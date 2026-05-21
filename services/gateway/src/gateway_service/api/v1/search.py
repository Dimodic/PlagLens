"""GET /api/v1/search — federated search across course / assignment / user services.

Gateway-owned endpoint (not proxied via routing table). Runs **after** the JWT
middleware has populated ``request.state.principal``. Each backend call is a
direct internal HTTP request via the shared ``httpx.AsyncClient``; we forward
``X-User-Id`` / ``X-Tenant-Id`` / ``X-Global-Role`` so downstream services can
apply RBAC just like they do for the proxied path.

The response shape is intentionally flat for the frontend ⌘K palette:

    {
      "q": "...",
      "groups": [
        {"type": "course",     "items": [...]},
        {"type": "assignment", "items": [...]},
        {"type": "user",       "items": [...]}
      ]
    }
"""

from __future__ import annotations

import asyncio
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from gateway_service.auth import Principal
from gateway_service.config import settings
from gateway_service.errors import problem_response
from gateway_service.logging import get_logger
from gateway_service.proxy.http_client import get_http_client

router = APIRouter(tags=["search"])
log = get_logger(__name__)

_DEFAULT_TYPES = ("course", "assignment", "user")
_INTERNAL_TIMEOUT = httpx.Timeout(5.0, connect=2.0)


def _principal_headers(principal: Principal, request_id: str | None) -> dict[str, str]:
    headers: dict[str, str] = {"Accept": "application/json"}
    if principal.user_id:
        headers["X-User-Id"] = principal.user_id
    if principal.tenant_id:
        headers["X-Tenant-Id"] = principal.tenant_id
    if principal.global_role:
        headers["X-Global-Role"] = principal.global_role
    # Forward the original Authorization so backend's get_current_user works
    # exactly as it does for the proxied path.
    auth = principal.raw_claims.get("__authorization__") if principal.raw_claims else None
    if isinstance(auth, str):
        headers["Authorization"] = auth
    if request_id:
        headers["X-Request-Id"] = request_id
    return headers


def _forward_authorization(request: Request, headers: dict[str, str]) -> dict[str, str]:
    """Pass the inbound Authorization through to backend calls."""
    auth = request.headers.get("authorization")
    if auth:
        headers["Authorization"] = auth
    return headers


async def _fetch_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: dict[str, str],
) -> dict[str, Any]:
    resp = await client.request(method, url, headers=headers, timeout=_INTERNAL_TIMEOUT)
    if resp.status_code >= 400:
        raise httpx.HTTPStatusError(
            f"backend returned {resp.status_code}", request=resp.request, response=resp
        )
    return resp.json()


async def _search_courses(
    client: httpx.AsyncClient,
    q: str,
    limit: int,
    headers: dict[str, str],
) -> list[dict[str, Any]]:
    base = settings.backends_map().get("course")
    if not base:
        return []
    qs = urlencode({"q": q, "limit": limit})
    url = f"{base.rstrip('/')}/api/v1/courses?{qs}"
    payload = await _fetch_json(client, "GET", url, headers)
    items = payload.get("data") or payload.get("items") or []
    out: list[dict[str, Any]] = []
    for c in items:
        cid = c.get("id")
        slug = c.get("slug")
        out.append(
            {
                "id": str(cid) if cid is not None else "",
                "slug": slug,
                "title": c.get("name") or slug or "",
                "url": f"/courses/{slug}" if slug else f"/courses/{cid}",
            }
        )
    return out


async def _search_assignments(
    client: httpx.AsyncClient,
    q: str,
    limit: int,
    headers: dict[str, str],
) -> list[dict[str, Any]]:
    base = settings.backends_map().get("course")
    if not base:
        return []
    qs = urlencode({"q": q, "limit": limit})
    url = f"{base.rstrip('/')}/api/v1/assignments?{qs}"
    payload = await _fetch_json(client, "GET", url, headers)
    items = payload.get("data") or payload.get("items") or []
    out: list[dict[str, Any]] = []
    for a in items:
        aid = a.get("id")
        out.append(
            {
                "id": str(aid) if aid is not None else "",
                "title": a.get("title") or "",
                "course_id": a.get("course_id"),
                "url": f"/assignments/{aid}" if aid is not None else "",
            }
        )
    return out


async def _search_users(
    client: httpx.AsyncClient,
    q: str,
    limit: int,
    headers: dict[str, str],
    principal: Principal,
) -> list[dict[str, Any]]:
    # Students/teachers cannot enumerate other users — the identity backend
    # already enforces RBAC, but we short-circuit here to avoid noise.
    if principal.global_role not in ("admin",):
        return []
    base = settings.backends_map().get("identity")
    if not base:
        return []
    qs = urlencode({"q": q, "limit": limit})
    url = f"{base.rstrip('/')}/api/v1/users?{qs}"
    payload = await _fetch_json(client, "GET", url, headers)
    items = payload.get("data") or payload.get("items") or []
    out: list[dict[str, Any]] = []
    for u in items:
        uid = u.get("id")
        title = u.get("display_name") or u.get("email") or ""
        out.append(
            {
                "id": str(uid) if uid is not None else "",
                "title": title,
                "email": u.get("email"),
                "url": f"/admin/users/{uid}" if uid is not None else "",
            }
        )
    return out


@router.get("/api/v1/search", summary="Federated global search")
async def global_search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=120),
    types: str | None = Query(default=None, description="Comma-separated subset of: course,assignment,user"),
    limit: int = Query(default=5, ge=1, le=20),
):
    principal: Principal | None = getattr(request.state, "principal", None)
    if principal is None:
        return problem_response(
            status=401,
            code="UNAUTHENTICATED",
            title="Unauthenticated",
            detail="Bearer token required",
            request=request,
        )

    requested = {t.strip() for t in (types or ",".join(_DEFAULT_TYPES)).split(",") if t.strip()}
    if not requested:
        requested = set(_DEFAULT_TYPES)

    headers = _forward_authorization(
        request,
        _principal_headers(principal, getattr(request.state, "request_id", None)),
    )

    client = get_http_client()

    type_to_coro: dict[str, Any] = {}
    if "course" in requested:
        type_to_coro["course"] = _search_courses(client, q, limit, headers)
    if "assignment" in requested:
        type_to_coro["assignment"] = _search_assignments(client, q, limit, headers)
    if "user" in requested:
        type_to_coro["user"] = _search_users(client, q, limit, headers, principal)

    if not type_to_coro:
        return JSONResponse(content={"q": q, "groups": []}, status_code=200)

    labels = list(type_to_coro.keys())
    results = await asyncio.gather(*type_to_coro.values(), return_exceptions=True)

    groups: list[dict[str, Any]] = []
    for label, result in zip(labels, results, strict=False):
        if isinstance(result, BaseException):
            log.warning(
                "search_group_failed",
                group=label,
                error=type(result).__name__,
                detail=str(result)[:200],
            )
            groups.append({"type": label, "items": [], "error": type(result).__name__})
        else:
            groups.append({"type": label, "items": result})

    return JSONResponse(content={"q": q, "groups": groups}, status_code=200)


__all__ = ["router"]
