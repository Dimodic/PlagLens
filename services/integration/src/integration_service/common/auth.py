"""JWT principal stub. Real verification will live in plaglens-rbac."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Optional

from fastapi import Header

from integration_service.common.problems import ProblemException


@dataclass
class Principal:
    user_id: str
    tenant_id: str
    global_role: str = "student"
    course_roles: Dict[str, str] = field(default_factory=dict)
    is_internal: bool = False

    @property
    def is_super_admin(self) -> bool:
        return self.global_role == "super_admin"

    @property
    def is_admin(self) -> bool:
        return self.global_role in ("super_admin", "admin")

    def has_global(self, *roles: str) -> bool:
        return self.global_role in roles

    def course_role(self, course_id: Optional[str]) -> Optional[str]:
        if course_id is None:
            return None
        return self.course_roles.get(course_id)

    def has_course(self, course_id: Optional[str], *roles: str) -> bool:
        if self.is_super_admin or self.is_admin:
            return True
        return self.course_role(course_id) in roles


async def get_principal(
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_tenant_id: Optional[str] = Header(default=None),
    x_global_role: Optional[str] = Header(default="student"),
) -> Principal:
    """Stub: in production we'd verify JWT in `Authorization`. For now we accept
    test-friendly `X-User-Id` / `X-Tenant-Id` / `X-Global-Role` headers, plus we
    fall back to anonymous when nothing is supplied (most endpoints do their own
    role-checking on top of the principal)."""
    if x_user_id and x_tenant_id:
        return Principal(
            user_id=x_user_id,
            tenant_id=x_tenant_id,
            global_role=x_global_role or "student",
        )
    if authorization and authorization.lower().startswith("bearer "):
        # TODO: real JWT verify
        token = authorization.split(" ", 1)[1].strip()
        if not token:
            raise ProblemException(401, "UNAUTHENTICATED", "Unauthenticated")
        return Principal(user_id="usr_anon", tenant_id="tnt_default")
    return Principal(user_id="usr_anon", tenant_id="tnt_default")


async def require_admin(p: Principal) -> Principal:
    if not p.is_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "admin role required")
    return p


def ensure_role(p: Principal, *roles: str) -> None:
    if p.is_super_admin:
        return
    if p.global_role not in roles:
        raise ProblemException(
            403,
            "FORBIDDEN",
            "Forbidden",
            f"requires one of: {', '.join(roles)}",
        )


def ensure_course_role(p: Principal, course_id: Optional[str], *roles: str) -> None:
    if p.is_super_admin or p.is_admin:
        return
    cr = p.course_role(course_id)
    if cr not in roles:
        raise ProblemException(
            403,
            "FORBIDDEN",
            "Forbidden",
            f"course role required: {', '.join(roles)}",
        )
