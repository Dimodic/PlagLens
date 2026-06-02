"""JWT validation, principal, RBAC dependencies."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import jwt
from fastapi import Depends, Header, Request, status

from notification_service.config import get_settings
from notification_service.errors import Problem


@dataclass
class Principal:
    sub: str
    tenant_id: str
    global_role: str = "student"
    course_roles: dict[str, str] = field(default_factory=dict)
    locale: str = "ru"
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def user_id(self) -> str:
        return self.sub

    def is_admin(self) -> bool:
        return self.global_role in ("admin",)


def _decode_jwt(token: str) -> dict[str, Any]:
    settings = get_settings()
    key: str | None = settings.JWT_PUBLIC_KEY
    if key is None and settings.JWT_PUBLIC_KEY_PATH:
        try:
            with open(settings.JWT_PUBLIC_KEY_PATH, encoding="utf-8") as f:
                key = f.read()
        except OSError:
            key = None
    if key is None:
        # In dev/testing: allow HS256 with shared secret == empty (decode without verify).
        try:
            return jwt.decode(token, options={"verify_signature": False})
        except jwt.PyJWTError as e:
            raise Problem(401, "UNAUTHENTICATED", "Unauthenticated", str(e))
    try:
        return jwt.decode(
            token,
            key=key,
            algorithms=[settings.JWT_ALGORITHM],
            audience=settings.JWT_AUDIENCE,
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise Problem(401, "TOKEN_EXPIRED", "Token expired")
    except jwt.PyJWTError as e:
        raise Problem(401, "UNAUTHENTICATED", "Unauthenticated", str(e))


def principal_from_payload(payload: dict[str, Any]) -> Principal:
    return Principal(
        sub=str(payload.get("sub") or payload.get("user_id") or ""),
        tenant_id=str(payload.get("tenant_id") or ""),
        global_role=str(payload.get("global_role") or payload.get("role") or "student"),
        course_roles=dict(payload.get("course_roles") or {}),
        locale=str(payload.get("locale") or "ru"),
        raw=payload,
    )


def _dev_principal_from_request(request: Request) -> Principal | None:
    settings = get_settings()
    if not settings.AUTH_DISABLED:
        return None
    user_id = request.headers.get("X-User-Id") or "usr_test"
    tenant_id = request.headers.get("X-Tenant-Id") or "tnt_test"
    role = request.headers.get("X-Role") or "admin"
    return Principal(sub=user_id, tenant_id=tenant_id, global_role=role)


def _extract_token(
    request: Request, authorization: str | None
) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    # SSE compatibility: ?access_token=
    qp = request.query_params.get("access_token")
    if qp:
        return qp
    return None


def get_principal(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Principal:
    dev = _dev_principal_from_request(request)
    if dev is not None:
        return dev
    token = _extract_token(request, authorization)
    if not token:
        raise Problem(status.HTTP_401_UNAUTHORIZED, "UNAUTHENTICATED", "Missing bearer token")
    payload = _decode_jwt(token)
    return principal_from_payload(payload)


def require_admin(principal: Principal = Depends(get_principal)) -> Principal:
    if not principal.is_admin():
        raise Problem(403, "FORBIDDEN", "Admin role required")
    return principal
