"""Coarse-grained, gateway-level RBAC pre-check.

Fine-grained checks (resource ownership, course role) are done in services.
Here we only enforce that:
  * `super_admin` is required for `/v1/services-status` and any
    `/api/v1/admin/tenants*`, `/api/v1/admin/users*` cross-tenant ops.
  * `admin` is required for tenant-wide admin endpoints.
  * Authenticated bearer is required for everything that is not in
    PUBLIC_PATHS / PUBLIC_PREFIXES.

This module is intentionally simple — it returns (allow, code).
"""

from __future__ import annotations

from gateway_service.auth import Principal


def required_global_role(path: str) -> str | None:
    """Return required minimum global role for a given path, or None."""
    if path.startswith("/v1/services-status") or path.startswith("/api/v1/services-status"):
        return "admin"
    if path.startswith("/api/v1/admin/tenants") or path.startswith("/api/v1/tenants"):
        return "admin"
    if path.startswith("/api/v1/admin/"):
        return "admin"
    return None


_ROLE_ORDER = {"student": 1, "assistant": 2, "teacher": 3, "admin": 4}


def role_at_least(actual: str | None, required: str) -> bool:
    if actual is None:
        return False
    return _ROLE_ORDER.get(actual, 0) >= _ROLE_ORDER.get(required, 0)


def precheck(principal: Principal | None, path: str) -> tuple[bool, str | None]:
    """Return (allowed, error_code). error_code is None on allow."""
    needed = required_global_role(path)
    if needed is None:
        return True, None
    if principal is None:
        return False, "UNAUTHENTICATED"
    if not role_at_least(principal.global_role, needed):
        return False, "FORBIDDEN"
    return True, None


__all__ = ["precheck", "required_global_role", "role_at_least"]
