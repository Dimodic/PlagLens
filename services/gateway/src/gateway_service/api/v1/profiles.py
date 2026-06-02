"""GET /api/v1/profiles/{user_id} — aggregated public profile.

Gateway-owned fan-out (like /search): the identity directory card +
the person's course memberships + the person's submissions *visible to
the viewer* (the submission service gates those). Each piece degrades to
empty on a backend hiccup so a partial profile still renders; only a
missing card is fatal (404)."""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from gateway_service.config import settings
from gateway_service.errors import problem_response
from gateway_service.logging import get_logger
from gateway_service.proxy.http_client import get_http_client

router = APIRouter(tags=["profiles"])
log = get_logger(__name__)
_T = httpx.Timeout(8.0, connect=2.0)


def _headers(request: Request) -> dict[str, str]:
    principal = getattr(request.state, "principal", None)
    h: dict[str, str] = {"Accept": "application/json"}
    if principal is not None:
        if principal.user_id:
            h["X-User-Id"] = principal.user_id
        if principal.tenant_id:
            h["X-Tenant-Id"] = principal.tenant_id
        if principal.global_role:
            h["X-Global-Role"] = principal.global_role
    auth = request.headers.get("authorization")
    if auth:
        h["Authorization"] = auth
    rid = getattr(request.state, "request_id", None)
    if rid:
        h["X-Request-Id"] = rid
    return h


async def _get(client: httpx.AsyncClient, url: str, headers: dict[str, str]) -> Any:
    r = await client.get(url, headers=headers, timeout=_T)
    if r.status_code >= 400:
        raise httpx.HTTPStatusError(
            f"backend {r.status_code}", request=r.request, response=r
        )
    return r.json()


@router.get("/api/v1/profiles/{user_id}", summary="Aggregated public profile")
async def get_profile(user_id: str, request: Request):
    principal = getattr(request.state, "principal", None)
    if principal is None:
        return problem_response(
            status=401,
            code="UNAUTHENTICATED",
            title="Unauthenticated",
            detail="Bearer token required",
            request=request,
        )
    headers = _headers(request)
    client = get_http_client()
    identity = settings.backends_map().get("identity")
    course = settings.backends_map().get("course")
    submission = settings.backends_map().get("submission")

    async def _card() -> Any:
        if not identity:
            return None
        return await _get(
            client, f"{identity.rstrip('/')}/api/v1/people/{user_id}", headers
        )

    async def _courses() -> list[dict[str, Any]]:
        if not course:
            return []
        d = await _get(
            client, f"{course.rstrip('/')}/api/v1/people/{user_id}/courses", headers
        )
        return d.get("data") or []

    async def _submissions() -> list[dict[str, Any]]:
        if not submission:
            return []
        d = await _get(
            client,
            f"{submission.rstrip('/')}/api/v1/people/{user_id}/submissions?limit=200",
            headers,
        )
        return d.get("data") or []

    card_r, courses_r, subs_r = await asyncio.gather(
        _card(), _courses(), _submissions(), return_exceptions=True
    )
    if isinstance(card_r, BaseException) or card_r is None:
        return problem_response(
            status=404,
            code="NOT_FOUND",
            title="Profile not found",
            detail="No such user, or not visible.",
            request=request,
        )
    return JSONResponse(
        content={
            "card": card_r,
            "courses": courses_r if not isinstance(courses_r, BaseException) else [],
            "submissions": subs_r if not isinstance(subs_r, BaseException) else [],
        },
        status_code=200,
    )


__all__ = ["router"]
