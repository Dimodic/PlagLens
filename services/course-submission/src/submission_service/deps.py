"""FastAPI dependency providers: auth context, db session, RBAC."""
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Annotated

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .common.auth import AuthContext
from .common.problem import forbidden, unauthenticated
from .config import Settings, get_settings
from .db import get_session as _db_session


async def get_session() -> AsyncIterator[AsyncSession]:
    async for s in _db_session():
        yield s


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _load_jwt_key(settings: Settings) -> str | None:
    if settings.JWT_PUBLIC_KEY:
        return settings.JWT_PUBLIC_KEY
    if settings.JWT_PUBLIC_KEY_PATH:
        try:
            with open(settings.JWT_PUBLIC_KEY_PATH, encoding="utf-8") as fh:
                return fh.read()
        except OSError:
            return None
    return None


async def current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    x_test_user: Annotated[str | None, Header(alias="X-Test-User")] = None,
    settings: Annotated[Settings, Depends(get_settings)] = None,  # type: ignore[assignment]
) -> AuthContext:
    """Extract AuthContext from JWT (or from a test header in dev mode).

    The ``X-Test-User`` header carries a JSON-encoded ``AuthContext`` and is
    accepted only when ``AUTH_DISABLED`` is true. Production deployments must
    keep that flag off.
    """
    settings = settings or get_settings()

    if settings.AUTH_DISABLED and x_test_user:
        try:
            payload = json.loads(x_test_user)
            ctx = AuthContext(
                user_id=payload["user_id"],
                tenant_id=payload["tenant_id"],
                global_role=payload.get("global_role", "student"),
                course_roles=payload.get("course_roles") or {},
                raw=payload,
            )
            request.state.auth = ctx
            return ctx
        except Exception:
            raise unauthenticated("Invalid X-Test-User header")

    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthenticated()

    token = authorization.split(" ", 1)[1].strip()
    key = _load_jwt_key(settings)
    options = {"verify_aud": False}
    try:
        if key:
            payload = jwt.decode(
                token,
                key,
                algorithms=[settings.JWT_ALGORITHM],
                audience=settings.JWT_AUDIENCE,
                options=options,
            )
        else:
            payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
    except jwt.ExpiredSignatureError:
        raise unauthenticated("Token expired")
    except jwt.PyJWTError:
        raise unauthenticated("Invalid token")

    ctx = AuthContext(
        user_id=str(payload.get("sub", "")),
        tenant_id=str(payload.get("tenant_id", "")),
        global_role=str(payload.get("global_role", "student")),
        course_roles=payload.get("course_roles") or {},
        raw=payload,
    )
    if not ctx.user_id or not ctx.tenant_id:
        raise unauthenticated("Token missing claims")
    request.state.auth = ctx
    return ctx


CurrentUser = Annotated[AuthContext, Depends(current_user)]


def require_global_role(*roles: str):
    async def _checker(user: CurrentUser) -> AuthContext:
        if user.global_role in set(roles) or user.is_admin:
            return user
        raise forbidden(f"Global role required: {', '.join(roles)}")

    return _checker


def require_course_role(*roles: str):
    """Returns a dependency that checks the user has one of the given roles
    in the course identified by path param ``course_id`` (or via resource
    lookup outside this dep)."""

    async def _checker(course_id: str, user: CurrentUser) -> AuthContext:
        if user.is_admin:
            return user
        if user.course_role(course_id) in set(roles):
            return user
        raise forbidden(f"Course role required: {', '.join(roles)}")

    return _checker
