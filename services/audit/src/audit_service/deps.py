"""FastAPI dependencies: DB session, auth, RBAC."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .common.problem import ProblemException
from .common.security import decode_access_token
from .config import settings
from .db import session_dep


@dataclass
class CurrentUser:
    id: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str]
    jti: str | None
    raw: dict[str, Any]


async def get_session() -> AsyncSession:
    async for s in session_dep():
        yield s  # type: ignore[misc]


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Authentication required",
            detail="Missing or malformed Authorization header.",
        )
    return authorization.split(None, 1)[1].strip()


async def current_user(
    request: Request,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> CurrentUser:
    if settings.auth_disabled:
        # Test/local convenience: allow X-Test-User-* headers.
        return CurrentUser(
            id=request.headers.get("X-Test-User-Id", "usr_test"),
            tenant_id=request.headers.get("X-Test-Tenant-Id", "tnt_test"),
            global_role=request.headers.get("X-Test-Role", "admin"),
            course_roles={},
            jti=None,
            raw={},
        )

    token = _extract_bearer(authorization)
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError as exc:
        raise ProblemException(
            status=401,
            code="TOKEN_EXPIRED",
            title="Access token expired",
            detail=str(exc),
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Invalid access token",
            detail=str(exc),
        ) from exc

    user = CurrentUser(
        id=payload["sub"],
        tenant_id=payload.get("tenant_id", ""),
        global_role=payload.get("global_role", "student"),
        course_roles=payload.get("course_roles", {}) or {},
        jti=payload.get("jti"),
        raw=payload,
    )
    request.state.current_user = user
    request.state.tenant_id = user.tenant_id
    request.state.user_id = user.id
    return user


def require_global_role(*allowed: str):
    async def _dep(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.global_role == "super_admin":
            return user
        if user.global_role not in allowed:
            raise ProblemException(
                status=403,
                code="FORBIDDEN",
                title="Insufficient role",
                detail=f"Required role one of: {', '.join(allowed)}",
            )
        return user

    return _dep


def require_super_admin():
    async def _dep(user: CurrentUser = Depends(current_user)) -> CurrentUser:
        if user.global_role != "super_admin":
            raise ProblemException(
                status=403,
                code="FORBIDDEN",
                title="super_admin required",
            )
        return user

    return _dep


def resolve_tenant_scope(
    user: CurrentUser,
    x_cross_tenant: str | None = None,
) -> str | None:
    """Returns the tenant_id to filter queries by, or None for cross-tenant
    super_admin access. Non-super_admin users always pinned to their tenant."""
    if user.global_role == "super_admin" and x_cross_tenant:
        return x_cross_tenant
    if user.global_role == "super_admin" and x_cross_tenant is None:
        # super_admin without explicit header sees their own tenant only.
        return user.tenant_id or None
    return user.tenant_id


async def tenant_scope(
    user: CurrentUser = Depends(current_user),
    x_cross_tenant: str | None = Header(default=None, alias="X-Cross-Tenant"),
) -> str | None:
    return resolve_tenant_scope(user, x_cross_tenant)


def require_internal_service_token(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> str:
    """Internal write API auth: ``Authorization: Bearer service:<name>:<token>``."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Service token required",
        )
    raw = authorization.split(None, 1)[1].strip()
    parts = raw.split(":")
    if len(parts) != 3 or parts[0] != "service":
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Malformed service token",
            detail="Expected 'service:<name>:<token>'",
        )
    name, token = parts[1], parts[2]
    if token != settings.internal_service_token:
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Invalid service token",
        )
    if not name:
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Service name required",
        )
    return name
