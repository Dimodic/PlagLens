"""JWT-based RBAC helpers (per 02-RBAC.md).

Auth model: bearer JWT signed by Identity Service. We validate locally using a
public key from settings; in tests we accept an unsigned dev token (when
``settings.auth_required`` is False).

Two-layer roles:
- ``global_role`` — ``super_admin | admin | teacher | student``
- ``course_roles`` — mapping ``course_id -> owner | co_owner | assistant | student``
"""
from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Iterable

import jwt
from fastapi import Header, Request

from ..config import settings
from .problem import ProblemError, forbidden, tenant_mismatch, unauthenticated


@dataclass
class Principal:
    user_id: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str] = field(default_factory=dict)
    raw: dict = field(default_factory=dict)

    def is_super_admin(self) -> bool:
        return self.global_role == "super_admin"

    def is_admin(self) -> bool:
        return self.global_role in ("admin", "super_admin")

    def course_role(self, course_id: str | None) -> str | None:
        if course_id is None:
            return None
        return self.course_roles.get(course_id)

    def has_course_role(self, course_id: str | None, *roles: str) -> bool:
        cr = self.course_role(course_id)
        return cr is not None and cr in roles


def _decode_unsafe(token: str) -> dict:
    parts = token.split(".")
    if len(parts) < 2:
        raise unauthenticated("Malformed token")
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        return json.loads(base64.urlsafe_b64decode(payload.encode()))
    except Exception as exc:
        raise unauthenticated("Malformed token") from exc


def _decode_token(token: str) -> dict:
    if settings.jwt_public_key:
        try:
            return jwt.decode(
                token,
                settings.jwt_public_key,
                algorithms=[settings.jwt_algorithm],
                audience=settings.jwt_audience,
                issuer=settings.jwt_issuer,
            )
        except jwt.PyJWTError as exc:
            raise unauthenticated(str(exc)) from exc
    return _decode_unsafe(token)


def get_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    x_dev_user: str | None = Header(default=None),
    x_dev_tenant: str | None = Header(default=None),
    x_dev_role: str | None = Header(default=None),
    x_dev_course_role: str | None = Header(default=None),
) -> Principal:
    if not authorization:
        if not settings.auth_required:
            principal = Principal(
                user_id=x_dev_user or "usr_dev",
                tenant_id=x_dev_tenant or "tnt_dev",
                global_role=x_dev_role or "admin",
                course_roles={},
            )
            if x_dev_course_role:
                for entry in x_dev_course_role.split(","):
                    if ":" in entry:
                        cid, role = entry.split(":", 1)
                        principal.course_roles[cid.strip()] = role.strip()
            request.state.principal = principal
            return principal
        raise unauthenticated()
    if not authorization.lower().startswith("bearer "):
        raise unauthenticated("Authorization must be Bearer scheme")
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_token(token)
    principal = Principal(
        user_id=str(payload.get("sub", "")),
        tenant_id=str(payload.get("tenant_id", "")),
        global_role=str(payload.get("global_role", "student")),
        course_roles=dict(payload.get("course_roles") or {}),
        raw=payload,
    )
    request.state.principal = principal
    return principal


def require_global(*roles: str):
    def _dep(principal: Principal):
        if principal.is_super_admin():
            return principal
        if principal.global_role not in roles:
            raise forbidden(f"Requires one of: {', '.join(roles)}")
        return principal

    return _dep


def assert_tenant(principal: Principal, resource_tenant_id: str | None) -> None:
    if resource_tenant_id is None:
        return
    if principal.is_super_admin():
        return
    if principal.tenant_id != resource_tenant_id:
        raise tenant_mismatch()


def assert_course_role(
    principal: Principal,
    course_id: str | None,
    allowed: Iterable[str],
) -> None:
    # Admins bypass everything.
    if principal.is_super_admin() or principal.is_admin():
        return
    # Same fallback as submission-service rbac: identity-service
    # doesn't yet enrich JWTs with per-course memberships, so a JWT
    # without ``course_roles`` represents a global teacher/owner who
    # legitimately manages every course they're tied to in the course
    # service. This must come *before* the ``course_id is None`` guard
    # below, because some GET endpoints (e.g. the assignment-scoped
    # run list page) don't carry a course_id query param at all — the
    # earlier ordering would 403 them with "Course context required"
    # even though the very same JWT grades submissions fine via
    # submission-service.
    if not principal.course_roles and principal.global_role in {
        "owner",
        "co_owner",
        "assistant",
        "teacher",
    }:
        return
    if course_id is None:
        raise forbidden("Course context required")
    if principal.has_course_role(course_id, *allowed):
        return
    raise forbidden(f"Requires course role: {', '.join(allowed)}")


def assert_self_or_role(
    principal: Principal,
    *,
    submission_author_id: str | None,
    course_id: str | None,
    teacher_roles: Iterable[str] = ("owner", "co_owner", "assistant"),
) -> None:
    """Allow the submission's own author OR a course teacher."""
    if principal.is_super_admin() or principal.is_admin():
        return
    if submission_author_id and principal.user_id == submission_author_id:
        return
    try:
        assert_course_role(principal, course_id, teacher_roles)
    except ProblemError as exc:
        raise forbidden(
            "Action allowed only for the submission owner or course teachers"
        ) from exc
