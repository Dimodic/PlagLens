"""JWT-derived principal + RBAC helpers."""
from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

import jwt
from fastapi import Header, Request

from ai_analysis_service.common.problem import ProblemException, forbidden
from ai_analysis_service.config import get_settings


@dataclass
class Principal:
    user_id: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    def has_global(self, *roles: str) -> bool:
        return self.global_role in roles

    def course_role(self, course_id: str | None) -> str | None:
        if not course_id:
            return None
        return self.course_roles.get(course_id)

    def has_course_role(self, course_id: str | None, *roles: str) -> bool:
        cr = self.course_role(course_id)
        return cr is not None and cr in roles


_SUPER = "super_admin"
_TEACHER_ROLES = ("owner", "co_owner", "assistant")


def _decode_jwt(token: str) -> dict[str, Any]:
    settings = get_settings()
    if settings.AUTH_DISABLED:
        # Should not be reached when auth disabled; caller handles bypass.
        return {}
    key = settings.JWT_PUBLIC_KEY or ""
    if settings.JWT_PUBLIC_KEY_PATH:
        with open(settings.JWT_PUBLIC_KEY_PATH, encoding="utf-8") as fh:
            key = fh.read()
    try:
        return jwt.decode(
            token,
            key=key,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            options={"verify_aud": True} if settings.JWT_AUDIENCE else {"verify_aud": False},
        )
    except jwt.PyJWTError as e:
        raise ProblemException(
            status_code=401,
            code="UNAUTHENTICATED",
            title="Unauthenticated",
            detail=str(e),
        )


def get_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    x_test_user: str | None = Header(default=None, alias="X-Test-User"),
    x_test_tenant: str | None = Header(default=None, alias="X-Test-Tenant"),
    x_test_role: str | None = Header(default=None, alias="X-Test-Role"),
    x_test_course_roles: str | None = Header(default=None, alias="X-Test-Course-Roles"),
) -> Principal:
    settings = get_settings()
    if settings.AUTH_DISABLED:
        course_roles: dict[str, str] = {}
        if x_test_course_roles:
            for chunk in x_test_course_roles.split(","):
                if ":" in chunk:
                    cid, role = chunk.split(":", 1)
                    course_roles[cid.strip()] = role.strip()
        principal = Principal(
            user_id=x_test_user or "usr_test",
            tenant_id=x_test_tenant or "tnt_test",
            global_role=x_test_role or "admin",
            course_roles=course_roles,
        )
        request.state.principal = principal
        return principal

    if not authorization or not authorization.lower().startswith("bearer "):
        raise ProblemException(
            status_code=401,
            code="UNAUTHENTICATED",
            title="Unauthenticated",
            detail="Bearer token required",
        )
    payload = _decode_jwt(authorization.split(" ", 1)[1])
    principal = Principal(
        user_id=str(payload.get("sub", "")),
        tenant_id=str(payload.get("tenant_id", "")),
        global_role=str(payload.get("global_role", "student")),
        course_roles={str(k): str(v) for k, v in (payload.get("course_roles") or {}).items()},
        raw=payload,
    )
    request.state.principal = principal
    return principal


def require_global_role(principal: Principal, *roles: str) -> None:
    if principal.global_role == _SUPER or principal.global_role in roles:
        return
    raise forbidden(f"Requires one of: {', '.join(roles)}")


def require_teacher_or_assistant(
    principal: Principal,
    course_id: str | None,
    allow_global: Iterable[str] = ("admin", "teacher"),
) -> None:
    if principal.global_role == _SUPER or principal.global_role in allow_global:
        return
    if course_id and principal.has_course_role(course_id, *_TEACHER_ROLES):
        return
    raise forbidden("Teacher or assistant role required for this course")


def require_admin(principal: Principal) -> None:
    require_global_role(principal, "admin")
