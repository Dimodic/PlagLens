"""Role-based authorization helpers.

See `docs/architecture/legacy/02-RBAC.md`.
"""

from __future__ import annotations

import functools
import inspect
from collections.abc import Callable, Iterable
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .auth import CurrentUser
from .errors import ForbiddenError, TenantMismatchError, UnauthenticatedError

GLOBAL_ROLES: tuple[str, ...] = ("super_admin", "admin", "teacher", "student")
COURSE_ROLES: tuple[str, ...] = ("owner", "co_owner", "assistant", "student")
SUPER_ADMIN: str = "super_admin"


class AuthzContext(BaseModel):
    """Context object passed through dependencies for authz decisions."""

    model_config = ConfigDict(extra="allow")

    user: CurrentUser
    course_id: str | None = None
    tenant_id_of_resource: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)

    def has_global_role(self, *roles: str) -> bool:
        if not roles:
            return True
        return self.user.global_role in roles

    def has_course_role(self, course_id: str, *roles: str) -> bool:
        role = self.user.course_roles.get(course_id)
        if role is None:
            return False
        if not roles:
            return True
        return role in roles


def _extract_user(args: tuple[Any, ...], kwargs: dict[str, Any]) -> CurrentUser:
    user = kwargs.get("user") or kwargs.get("current_user")
    if isinstance(user, CurrentUser):
        return user
    ctx = kwargs.get("authz") or kwargs.get("ctx")
    if isinstance(ctx, AuthzContext):
        return ctx.user
    for arg in args:
        if isinstance(arg, CurrentUser):
            return arg
        if isinstance(arg, AuthzContext):
            return arg.user
    raise UnauthenticatedError(
        "Authorization decorator requires `user`/`current_user`/`authz` parameter"
    )


def _extract_course_id(
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
    sig: inspect.Signature | None = None,
) -> str | None:
    cid = kwargs.get("course_id")
    if cid is not None:
        return str(cid)
    if sig is not None:
        params = list(sig.parameters.keys())
        for i, name in enumerate(params):
            if name == "course_id" and i < len(args):
                return str(args[i])
    ctx = kwargs.get("authz") or kwargs.get("ctx")
    if isinstance(ctx, AuthzContext) and ctx.course_id:
        return ctx.course_id
    return None


def _wrap(
    fn: Callable[..., Any],
    check_factory: Callable[[inspect.Signature], Callable[[tuple[Any, ...], dict[str, Any]], None]],
) -> Callable[..., Any]:
    sig = inspect.signature(fn)
    check = check_factory(sig)
    if inspect.iscoroutinefunction(fn):

        @functools.wraps(fn)
        async def _async(*args: Any, **kwargs: Any) -> Any:
            check(args, kwargs)
            return await fn(*args, **kwargs)

        return _async

    @functools.wraps(fn)
    def _sync(*args: Any, **kwargs: Any) -> Any:
        check(args, kwargs)
        return fn(*args, **kwargs)

    return _sync


def require_global_role(*allowed: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator factory: only users with one of `allowed` global roles pass."""

    allowed_roles = _normalise(allowed, GLOBAL_ROLES)

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        def make_check(_sig: inspect.Signature) -> Callable[[tuple[Any, ...], dict[str, Any]], None]:
            def check(args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
                user = _extract_user(args, kwargs)
                if user.global_role == SUPER_ADMIN:
                    return
                if user.global_role not in allowed_roles:
                    raise ForbiddenError(
                        f"Global role {user.global_role!r} not allowed; "
                        f"requires one of {sorted(allowed_roles)}"
                    ).to_exception()

            return check

        return _wrap(fn, make_check)

    return decorator


def require_course_role(*allowed: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Decorator factory: pass if user has any of `allowed` roles in the course.

    `super_admin` always passes (kross-tenant operator). Tenant mismatches are
    flagged separately via `TenantMismatchError` if `AuthzContext.tenant_id_of_resource`
    is provided.
    """

    allowed_roles = _normalise(allowed, COURSE_ROLES)

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        def make_check(sig: inspect.Signature) -> Callable[[tuple[Any, ...], dict[str, Any]], None]:
            def check(args: tuple[Any, ...], kwargs: dict[str, Any]) -> None:
                user = _extract_user(args, kwargs)
                if user.global_role == SUPER_ADMIN:
                    return

                ctx = kwargs.get("authz") or kwargs.get("ctx")
                if (
                    isinstance(ctx, AuthzContext)
                    and ctx.tenant_id_of_resource
                    and ctx.tenant_id_of_resource != user.tenant_id
                ):
                    raise TenantMismatchError(
                        "Resource tenant does not match user tenant"
                    ).to_exception()

                course_id = _extract_course_id(args, kwargs, sig=sig)
                if not course_id:
                    raise ForbiddenError(
                        "course_id required for require_course_role"
                    ).to_exception()

                role = user.course_roles.get(course_id)
                if role is None or role not in allowed_roles:
                    raise ForbiddenError(
                        f"Course role {role!r} not allowed for course {course_id}; "
                        f"requires one of {sorted(allowed_roles)}"
                    ).to_exception()

            return check

        return _wrap(fn, make_check)

    return decorator


def _normalise(roles: Iterable[str], universe: Iterable[str]) -> set[str]:
    universe_set = set(universe)
    out = set(roles)
    unknown = out - universe_set
    if unknown:
        raise ValueError(f"Unknown role(s): {sorted(unknown)}; expected subset of {sorted(universe_set)}")
    return out


__all__ = [
    "COURSE_ROLES",
    "GLOBAL_ROLES",
    "SUPER_ADMIN",
    "AuthzContext",
    "require_course_role",
    "require_global_role",
]
