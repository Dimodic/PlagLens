"""JWT bearer auth using RS256 + JWKS, with Redis-cached JWKS and revocation list.

See:
- `docs/architecture/legacy/01-CROSS-CUTTING.md` §8 (auth)
- `docs/architecture/legacy/02-RBAC.md` §6 (JWT payload)
"""

from __future__ import annotations

import contextlib
import json
import time
from collections.abc import Awaitable, Callable
from typing import Any, Protocol

import httpx
import jwt
from jwt import InvalidTokenError
from pydantic import BaseModel, ConfigDict, Field

from .errors import (
    ForbiddenError,
    TokenExpiredError,
    TokenRevokedError,
    UnauthenticatedError,
)

JWKS_CACHE_KEY: str = "plaglens:jwks"
REVOKED_PREFIX: str = "plaglens:jti_revoked:"
DEFAULT_TTL_SECONDS: int = 3600  # 1h


class _AsyncRedisLike(Protocol):
    """Minimal subset of redis.asyncio.Redis we depend on."""

    async def get(self, key: str) -> Any: ...
    async def set(self, key: str, value: Any, ex: int | None = None) -> Any: ...
    async def exists(self, key: str) -> Any: ...


class CurrentUser(BaseModel):
    """User context derived from a verified JWT.

    Mirrors the payload described in `02-RBAC.md` §6.
    """

    model_config = ConfigDict(extra="allow")

    sub: str
    tenant_id: str
    global_role: str
    course_roles: dict[str, str] = Field(default_factory=dict)
    jti: str | None = None
    exp: int | None = None
    iat: int | None = None
    course_roles_truncated: bool = False
    raw: dict[str, Any] = Field(default_factory=dict)


class JWKSCache:
    """Fetch + cache JWKS via Redis with TTL."""

    def __init__(
        self,
        jwks_url: str,
        redis: _AsyncRedisLike | None = None,
        *,
        ttl_seconds: int = DEFAULT_TTL_SECONDS,
        http_client: httpx.AsyncClient | None = None,
        cache_key: str = JWKS_CACHE_KEY,
    ) -> None:
        self._jwks_url = jwks_url
        self._redis = redis
        self._ttl = ttl_seconds
        self._client = http_client
        self._cache_key = cache_key
        self._memory_cache: dict[str, Any] | None = None
        self._memory_cache_expires_at: float = 0.0

    async def _fetch(self) -> dict[str, Any]:
        owns_client = False
        client = self._client
        if client is None:
            client = httpx.AsyncClient(timeout=5.0)
            owns_client = True
        try:
            resp = await client.get(self._jwks_url)
            resp.raise_for_status()
            data: dict[str, Any] = resp.json()
        finally:
            if owns_client:
                await client.aclose()
        if "keys" not in data:
            raise UnauthenticatedError("JWKS endpoint returned no keys")
        return data

    async def get_jwks(self) -> dict[str, Any]:
        # 1) Redis cache
        if self._redis is not None:
            try:
                raw = await self._redis.get(self._cache_key)
            except Exception:  # pragma: no cover - redis is optional
                raw = None
            if raw is not None:
                if isinstance(raw, bytes | bytearray):
                    raw = raw.decode("utf-8")
                with contextlib.suppress(json.JSONDecodeError):
                    return json.loads(raw)

        # 2) Process-local cache
        now = time.monotonic()
        if self._memory_cache is not None and now < self._memory_cache_expires_at:
            return self._memory_cache

        # 3) Network fetch
        jwks = await self._fetch()
        self._memory_cache = jwks
        self._memory_cache_expires_at = now + self._ttl

        if self._redis is not None:
            with contextlib.suppress(Exception):  # pragma: no cover - redis failure tolerated
                await self._redis.set(self._cache_key, json.dumps(jwks), ex=self._ttl)
        return jwks

    async def get_signing_key(self, kid: str) -> Any:
        jwks = await self.get_jwks()
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return jwt.PyJWK(key).key
        raise UnauthenticatedError(f"Signing key {kid!r} not found in JWKS")


class JWTBearer:
    """Async JWT verifier using RS256 keys from a JWKS endpoint.

    The class intentionally does **not** subclass FastAPI's `HTTPBearer` here so
    that the library remains importable without FastAPI installed. A FastAPI
    `HTTPBearer` adapter is created via `as_fastapi_dependency()`.
    """

    def __init__(
        self,
        jwks_cache: JWKSCache,
        *,
        audience: str | list[str] | None = None,
        issuer: str | None = None,
        leeway: int = 30,
        algorithms: tuple[str, ...] = ("RS256",),
    ) -> None:
        self._jwks = jwks_cache
        self._audience = audience
        self._issuer = issuer
        self._leeway = leeway
        self._algorithms = list(algorithms)

    async def verify(self, token: str) -> dict[str, Any]:
        if not token:
            raise UnauthenticatedError("Missing bearer token")
        try:
            unverified_header = jwt.get_unverified_header(token)
        except InvalidTokenError as exc:
            raise UnauthenticatedError("Malformed JWT header") from exc

        kid = unverified_header.get("kid")
        if not kid:
            raise UnauthenticatedError("JWT missing 'kid' header")

        signing_key = await self._jwks.get_signing_key(kid)
        try:
            payload: dict[str, Any] = jwt.decode(
                token,
                signing_key,
                algorithms=self._algorithms,
                audience=self._audience,
                issuer=self._issuer,
                leeway=self._leeway,
            )
        except jwt.ExpiredSignatureError as exc:
            raise TokenExpiredError("Access token expired") from exc
        except InvalidTokenError as exc:
            raise UnauthenticatedError(f"Invalid JWT: {exc}") from exc

        return payload


def revoke_check(redis: _AsyncRedisLike, prefix: str = REVOKED_PREFIX) -> Callable[[str], Awaitable[bool]]:
    """Return an async predicate that checks Redis for a revoked `jti`.

    Usage:
        is_revoked = revoke_check(redis_client)
        if await is_revoked(jti): raise TokenRevokedError(...)
    """

    async def _check(jti: str) -> bool:
        if not jti:
            return False
        try:
            return bool(await redis.exists(prefix + jti))
        except Exception:  # pragma: no cover
            return False

    return _check


def _payload_to_user(payload: dict[str, Any]) -> CurrentUser:
    return CurrentUser(
        sub=str(payload["sub"]),
        tenant_id=str(payload.get("tenant_id", "")),
        global_role=str(payload.get("global_role", "student")),
        course_roles=dict(payload.get("course_roles") or {}),
        jti=payload.get("jti"),
        exp=payload.get("exp"),
        iat=payload.get("iat"),
        course_roles_truncated=bool(payload.get("course_roles_truncated", False)),
        raw=payload,
    )


def _header_default() -> Any:
    """Return a `fastapi.Header(default=None)` if FastAPI is available, else `None`."""
    try:
        from fastapi import Header  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover
        return None
    return Header(default=None)


def get_current_user(
    bearer: JWTBearer,
    *,
    revoked_check: Callable[[str], Awaitable[bool]] | None = None,
) -> Callable[..., Awaitable[CurrentUser]]:
    """Build a FastAPI dependency that validates JWT and returns `CurrentUser`."""

    header_dep = _header_default()

    async def _dep(authorization: str | None = header_dep) -> CurrentUser:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise UnauthenticatedError("Missing Bearer token").to_exception()
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = await bearer.verify(token)
        except (UnauthenticatedError, TokenExpiredError) as err:
            raise err.to_exception() from err
        if revoked_check is not None:
            jti = str(payload.get("jti", ""))
            if jti and await revoked_check(jti):
                raise TokenRevokedError("Access token revoked").to_exception()
        return _payload_to_user(payload)

    return _dep


def get_optional_user(
    bearer: JWTBearer,
    *,
    revoked_check: Callable[[str], Awaitable[bool]] | None = None,
) -> Callable[..., Awaitable[CurrentUser | None]]:
    """Like `get_current_user` but returns `None` on missing/invalid token."""

    header_dep = _header_default()

    async def _dep(authorization: str | None = header_dep) -> CurrentUser | None:
        if not authorization or not authorization.lower().startswith("bearer "):
            return None
        token = authorization.split(" ", 1)[1].strip()
        try:
            payload = await bearer.verify(token)
        except (UnauthenticatedError, TokenExpiredError, ForbiddenError):
            return None
        if revoked_check is not None:
            jti = str(payload.get("jti", ""))
            if jti and await revoked_check(jti):
                return None
        return _payload_to_user(payload)

    return _dep


__all__ = [
    "DEFAULT_TTL_SECONDS",
    "JWKS_CACHE_KEY",
    "REVOKED_PREFIX",
    "CurrentUser",
    "JWKSCache",
    "JWTBearer",
    "get_current_user",
    "get_optional_user",
    "revoke_check",
]
