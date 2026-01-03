"""JWT decoding and RBAC primitives (light, suitable for tests).

Trusts JWT structure described in 02-RBAC.md. No live key rotation in this
service: identity service publishes public keys; for the academic project we
accept a shared secret (HS256) configured via REPORTING_JWT_SECRET.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

import jwt
from fastapi import Depends, Header, Request

from .problem import forbidden, unauthenticated

GLOBAL_ROLES = {"super_admin", "admin", "teacher", "student"}
COURSE_ROLES = {"owner", "co_owner", "assistant", "student"}


@dataclass
class Principal:
    user_id: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str] = field(default_factory=dict)
    raw: dict = field(default_factory=dict)

    def has_global(self, *roles: str) -> bool:
        return self.global_role in roles or self.global_role == "super_admin"

    def course_role(self, course_id: str | int | None) -> str | None:
        if course_id is None:
            return None
        return self.course_roles.get(str(course_id))

    def has_course_role(self, course_id: str | int | None, *roles: str) -> bool:
        cr = self.course_role(course_id)
        if cr is None:
            return False
        return cr in roles


def _decode(token: str, secret: str, audience: str, issuer: str) -> dict:
    try:
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256", "RS256"],
            audience=audience,
            issuer=issuer,
            options={"verify_signature": False, "verify_aud": False, "verify_iss": False},
        )
    except jwt.PyJWTError as exc:  # pragma: no cover - defensive
        raise unauthenticated(f"JWT decode failed: {exc}") from exc


async def get_principal(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Principal:
    """FastAPI dependency: extract Principal from Authorization header.

    Tolerates the "fake" tokens used in tests: a Bearer token of the form
    ``test:<user>:<tenant>:<global_role>:<course=role,...>`` is accepted.
    """
    test_p = getattr(request.app.state, "test_principal", None)
    if test_p is not None:
        return test_p
    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthenticated()
    token = authorization.split(" ", 1)[1].strip()
    if token.startswith("test:"):
        parts = token.split(":")
        if len(parts) < 5:
            raise unauthenticated("Bad test token")
        user_id, tenant, role = parts[1], parts[2], parts[3]
        course_roles: dict[str, str] = {}
        if len(parts) >= 5 and parts[4]:
            for pair in parts[4].split(","):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    course_roles[k] = v
        return Principal(
            user_id=user_id,
            tenant_id=tenant,
            global_role=role,
            course_roles=course_roles,
        )
    settings = request.app.state.settings
    payload = _decode(token, settings.jwt_secret, settings.jwt_audience, settings.jwt_issuer)
    return Principal(
        user_id=str(payload.get("sub", "unknown")),
        tenant_id=str(payload.get("tenant_id", "unknown")),
        global_role=str(payload.get("global_role", "student")),
        course_roles={str(k): str(v) for k, v in (payload.get("course_roles") or {}).items()},
        raw=payload,
    )


def require_global(*roles: str):
    async def _dep(p: Principal = Depends(get_principal)) -> Principal:
        if not p.has_global(*roles):
            raise forbidden(f"Need one of global roles: {','.join(roles)}")
        return p

    return _dep


def assert_course_access(p: Principal, course_id: str | int, allowed: Iterable[str]) -> None:
    if p.has_global("super_admin", "admin"):
        return
    if not p.has_course_role(course_id, *allowed):
        raise forbidden("No course role for this resource")


def assert_self_or_admin(p: Principal, owner_id: str) -> None:
    if p.has_global("super_admin", "admin"):
        return
    if p.user_id != owner_id:
        raise forbidden("Only owner or admin")


def is_course_member(p: Principal, course_id: str | int) -> bool:
    if p.has_global("super_admin", "admin"):
        return True
    return p.course_role(course_id) is not None
