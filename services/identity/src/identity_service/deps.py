"""FastAPI dependencies: DB session, auth, RBAC."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .common.problem import ProblemException
from .common.security import decode_access_token
from .db import session_dep


@dataclass
class CurrentUser:
    """Resolved request principal from JWT (no DB hit unless ``user`` accessed)."""

    id: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str]
    jti: Optional[str]
    raw: dict[str, Any]


# ---- DB session ---------------------------------------------------------- #
async def get_session() -> AsyncSession:
    # Re-export so routers depend on a single deps module.
    async for s in session_dep():
        yield s  # type: ignore[misc]


# ---- Auth ---------------------------------------------------------------- #
def _extract_bearer(authorization: Optional[str]) -> str:
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
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> CurrentUser:
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

    redis = getattr(request.app.state, "redis", None)
    jti = payload.get("jti")
    if redis is not None and jti:
        try:
            if await redis.get(f"revoked:jti:{jti}"):
                raise ProblemException(
                    status=401,
                    code="TOKEN_REVOKED",
                    title="Access token revoked",
                )
        except ProblemException:
            raise
        except Exception:
            pass  # Redis hiccup — fail open on revoke check

    user = CurrentUser(
        id=payload["sub"],
        tenant_id=payload.get("tenant_id", ""),
        global_role=payload.get("global_role", "student"),
        course_roles=payload.get("course_roles", {}) or {},
        jti=jti,
        raw=payload,
    )
    request.state.current_user = user
    request.state.tenant_id = user.tenant_id
    request.state.user_id = user.id
    return user


async def optional_current_user(
    request: Request,
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
) -> Optional[CurrentUser]:
    if not authorization:
        return None
    return await current_user(request, authorization)


# ---- RBAC dependencies --------------------------------------------------- #
GLOBAL_ROLE_ORDER = {"student": 0, "teacher": 1, "admin": 2, "super_admin": 3}


def require_global_role(*allowed: str):
    """Dependency factory: 403 if user.global_role not in allowed (unless super_admin)."""

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


def require_self_or_admin(target_user_id_param: str = "user_id"):
    """Allow if the authenticated user is the target, or has admin/super_admin."""

    async def _dep(
        request: Request,
        user: CurrentUser = Depends(current_user),
    ) -> CurrentUser:
        target = request.path_params.get(target_user_id_param)
        if user.global_role in ("admin", "super_admin"):
            return user
        if target and target == user.id:
            return user
        raise ProblemException(
            status=403,
            code="FORBIDDEN",
            title="Self or admin required",
        )

    return _dep


# ---- Tenant isolation helper -------------------------------------------- #
async def assert_same_tenant(user: CurrentUser, resource_tenant_id: str) -> None:
    if user.global_role == "super_admin":
        return
    if user.tenant_id != resource_tenant_id:
        raise ProblemException(
            status=403,
            code="TENANT_MISMATCH",
            title="Cross-tenant access denied",
        )
