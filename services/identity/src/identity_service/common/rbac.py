"""RBAC permissions matrix and role helpers (matches 02-RBAC.md)."""
from __future__ import annotations

from typing import Iterable, Literal

GlobalRole = Literal["super_admin", "admin", "teacher", "student"]
CourseRole = Literal["owner", "co_owner", "assistant", "student"]

GLOBAL_ROLES: tuple[GlobalRole, ...] = ("super_admin", "admin", "teacher", "student")
COURSE_ROLES: tuple[CourseRole, ...] = ("owner", "co_owner", "assistant", "student")


# A non-exhaustive catalogue of permissions used by Identity Service routes.
# Course-level permissions are out of scope for Identity (handled by Course Service).
PERMISSIONS_BY_GLOBAL_ROLE: dict[GlobalRole, set[str]] = {
    "super_admin": {
        "tenant.create",
        "tenant.list",
        "tenant.read",
        "tenant.update",
        "tenant.delete",
        "tenant.suspend",
        "tenant.activate",
        "tenant.settings.read",
        "tenant.settings.update",
        "tenant.usage.read",
        "tenant.audit.read",
        "user.list",
        "user.create",
        "user.read",
        "user.update",
        "user.delete",
        "user.disable",
        "user.enable",
        "user.anonymize",
        "user.reset_password",
        "user.force_logout",
        "user.role.assign",
        "user.sessions.read",
        "user.audit.read",
        "user.batch_create",
        "invitation.create",
        "invitation.list",
        "invitation.read",
        "invitation.delete",
        "cross_tenant.migrate_user",
        "cross_tenant.list_users",
    },
    "admin": {
        "tenant.read",
        "tenant.update",
        "tenant.settings.read",
        "tenant.settings.update",
        "tenant.usage.read",
        "tenant.audit.read",
        "user.list",
        "user.create",
        "user.read",
        "user.update",
        "user.delete",
        "user.disable",
        "user.enable",
        "user.anonymize",
        "user.reset_password",
        "user.force_logout",
        "user.role.assign",
        "user.sessions.read",
        "user.audit.read",
        "user.batch_create",
        "invitation.create",
        "invitation.list",
        "invitation.read",
        "invitation.delete",
    },
    "teacher": {
        "user.list",
        "user.batch_create",
        "invitation.create",
        "invitation.list",
        "invitation.read",
        "invitation.delete",
    },
    "student": set(),
}


def role_has_permission(role: GlobalRole | str, permission: str) -> bool:
    return permission in PERMISSIONS_BY_GLOBAL_ROLE.get(role, set())  # type: ignore[arg-type]


def any_role_has(roles: Iterable[GlobalRole | str], permission: str) -> bool:
    return any(role_has_permission(r, permission) for r in roles)


def is_admin_or_above(role: GlobalRole | str) -> bool:
    return role in ("super_admin", "admin")


def list_role_permissions(role: GlobalRole | str) -> list[str]:
    return sorted(PERMISSIONS_BY_GLOBAL_ROLE.get(role, set()))  # type: ignore[arg-type]
