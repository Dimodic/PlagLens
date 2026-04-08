"""FastAPI dependencies: DB session, auth, RBAC."""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import jwt
from fastapi import Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .common.problem import ProblemException
from .config import Settings, get_settings
from .repositories.members import MemberRepository

_engine_cache: dict[str, Any] = {}


def _get_engine_factory(settings: Settings):
    cached = _engine_cache.get("factory")
    if cached is not None:
        return cached
    engine = create_async_engine(settings.database_url, future=True)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    _engine_cache["engine"] = engine
    _engine_cache["factory"] = factory
    return factory


def configure_session_factory(factory) -> None:
    """Test hook: inject a custom async_sessionmaker."""
    _engine_cache["factory"] = factory


async def get_session(
    settings: Settings = Depends(get_settings),
) -> AsyncIterator[AsyncSession]:
    factory = _get_engine_factory(settings)
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


@dataclass(slots=True)
class CurrentUser:
    user_id: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str]
    raw: dict[str, Any]


def _load_jwt_key(settings: Settings) -> tuple[str, str]:
    """Returns (key, algorithm)."""
    if settings.jwt_public_key_path:
        path = Path(settings.jwt_public_key_path)
        if path.exists():
            return path.read_text(), "RS256"
    return settings.jwt_hs_secret, settings.jwt_algorithm


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ProblemException(
            status_code=401, detail="Missing bearer token", code="UNAUTHENTICATED"
        )
    token = authorization.split(" ", 1)[1].strip()
    key, alg = _load_jwt_key(settings)
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            options={"verify_aud": False, "verify_iss": False},
        )
    except jwt.PyJWTError as exc:
        raise ProblemException(
            status_code=401, detail=f"Invalid token: {exc}", code="UNAUTHENTICATED"
        ) from exc
    user_id = payload.get("sub")
    tenant_id = payload.get("tenant_id")
    if not user_id or not tenant_id:
        raise ProblemException(
            status_code=401, detail="Token missing sub/tenant_id", code="UNAUTHENTICATED"
        )
    user = CurrentUser(
        user_id=str(user_id),
        tenant_id=str(tenant_id),
        global_role=str(payload.get("global_role", "student")),
        course_roles={str(k): str(v) for k, v in (payload.get("course_roles") or {}).items()},
        raw=payload,
    )
    request.state.user = user
    return user


def require_global_role(*allowed: str):
    allowed_set = set(allowed)

    async def _check(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user.global_role == "super_admin" or user.global_role in allowed_set:
            return user
        raise ProblemException(
            status_code=403,
            detail=f"Global role {user.global_role!r} not permitted",
            code="FORBIDDEN",
        )

    return _check


_OWNER_ROLES = {"owner", "co_owner"}


async def _resolve_course_role(
    course_id: int,
    user: CurrentUser,
    session: AsyncSession,
) -> str | None:
    """Look up course role from local CourseOwner / CourseMember tables.

    Per spec §10.1 we trust the local DB rather than the JWT for freshness.
    """
    repo = MemberRepository(session)
    owner = await repo.get_owner(course_id, user.user_id)
    if owner is not None:
        return owner.role
    member = await repo.get_member(course_id, user.user_id)
    if member is not None:
        return member.role
    return None


def require_course_role(*allowed: str, allow_admin: bool = True):
    """Dependency factory enforcing a course-scoped role.

    Reads ``course_id`` from the path. Global ``super_admin`` and (if ``allow_admin``)
    ``admin`` always pass.
    """
    allowed_set = set(allowed)

    async def _check(
        course_id: int,
        user: CurrentUser = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> CurrentUser:
        if user.global_role == "super_admin":
            return user
        if allow_admin and user.global_role == "admin":
            return user
        role = await _resolve_course_role(course_id, user, session)
        if role is not None and role in allowed_set:
            return user
        raise ProblemException(
            status_code=403,
            detail="Insufficient course role",
            code="FORBIDDEN",
        )

    return _check


def require_course_role_for_assignment(*allowed: str, allow_admin: bool = True):
    """Variant that resolves course_id from the assignment_id path parameter."""
    from .repositories.assignments import AssignmentRepository

    allowed_set = set(allowed)

    async def _check(
        assignment_id: int,
        user: CurrentUser = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> CurrentUser:
        if user.global_role == "super_admin":
            return user
        if allow_admin and user.global_role == "admin":
            return user
        repo = AssignmentRepository(session)
        assignment = await repo.get(assignment_id)
        if assignment is None:
            raise ProblemException(
                status_code=404, detail="Assignment not found", code="NOT_FOUND"
            )
        role = await _resolve_course_role(assignment.course_id, user, session)
        if role is not None and role in allowed_set:
            return user
        raise ProblemException(
            status_code=403, detail="Insufficient course role", code="FORBIDDEN"
        )

    return _check


async def assert_course_membership(
    course_id: int,
    user: CurrentUser,
    session: AsyncSession,
) -> str:
    """Returns role (owner|co_owner|assistant|student) or raises 404/403."""
    if user.global_role in {"super_admin", "admin"}:
        return user.global_role
    role = await _resolve_course_role(course_id, user, session)
    if role is None:
        raise ProblemException(
            status_code=404, detail="Course not visible", code="NOT_FOUND"
        )
    return role


def is_course_manager(role: str) -> bool:
    return role in _OWNER_ROLES or role in {"super_admin", "admin"}


def any_of(values: Iterable[str]) -> set[str]:
    return set(values)
