"""JWT validation: JWKS-based RS256 + revoke list."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import jwt
from jwt import PyJWKClient
from jwt.algorithms import RSAAlgorithm

from gateway_service.config import settings
from gateway_service.jwks import get_jwks
from gateway_service.logging import get_logger
from gateway_service.metrics import jwt_validations_total
from gateway_service.redis_client import get_redis

log = get_logger(__name__)

# Redis SET name for revoked JTIs (token-revoke list).
REVOKE_LIST_KEY = "gw:revoke:jti"


class JWTError(Exception):
    """Generic JWT failure mapped to RFC7807 by middleware."""

    def __init__(self, code: str, status: int = 401, detail: str | None = None) -> None:
        self.code = code
        self.status = status
        self.detail = detail
        super().__init__(detail or code)


@dataclass(frozen=True)
class Principal:
    user_id: str
    tenant_id: str | None
    global_role: str | None
    course_roles: dict[str, str]
    jti: str | None
    raw_claims: dict[str, Any]


def _key_from_jwk(jwk: dict[str, Any]) -> Any:
    """Convert a JWK dict to a public key usable by PyJWT."""
    return RSAAlgorithm.from_jwk(jwk)


async def _resolve_signing_key(token: str) -> Any:
    headers = jwt.get_unverified_header(token)
    kid = headers.get("kid")
    jwks = await get_jwks()
    keys = jwks.get("keys", []) if isinstance(jwks, dict) else []
    if not keys:
        raise JWTError("UNAUTHENTICATED", detail="no_signing_keys")
    if kid:
        for jwk in keys:
            if jwk.get("kid") == kid:
                return _key_from_jwk(jwk)
        # Force refresh once if kid not found (rotation).
        jwks = await get_jwks(force_refresh=True)
        for jwk in jwks.get("keys", []):
            if jwk.get("kid") == kid:
                return _key_from_jwk(jwk)
        raise JWTError("UNAUTHENTICATED", detail="kid_not_found")
    # No kid - fall back to first key
    return _key_from_jwk(keys[0])


async def _is_revoked(jti: str | None) -> bool:
    if not jti:
        return False
    try:
        r = await get_redis()
        member = await r.sismember(REVOKE_LIST_KEY, jti)
        return bool(member)
    except Exception as e:  # pragma: no cover - tolerate redis blips
        log.warning("revoke_check_failed", error=str(e))
        return False


async def validate_token(token: str) -> Principal:
    """Validate a Bearer JWT (RS256, JWKS) and check revoke list."""
    try:
        key = await _resolve_signing_key(token)
    except JWTError:
        jwt_validations_total.labels(result="invalid_signature").inc()
        raise
    except Exception as e:
        jwt_validations_total.labels(result="invalid_signature").inc()
        raise JWTError("UNAUTHENTICATED", detail=f"jwks_error:{type(e).__name__}") from e

    options = {"require": ["exp", "iat"]}
    decoder_kwargs: dict[str, Any] = {
        "algorithms": list(settings.jwt_algorithms),
        "options": options,
    }
    if settings.jwt_audience:
        decoder_kwargs["audience"] = settings.jwt_audience
    if settings.jwt_issuer:
        decoder_kwargs["issuer"] = settings.jwt_issuer

    try:
        claims = jwt.decode(token, key=key, **decoder_kwargs)
    except jwt.ExpiredSignatureError as e:
        jwt_validations_total.labels(result="expired").inc()
        raise JWTError("TOKEN_EXPIRED", detail="token_expired") from e
    except jwt.InvalidSignatureError as e:
        jwt_validations_total.labels(result="invalid_signature").inc()
        raise JWTError("UNAUTHENTICATED", detail="invalid_signature") from e
    except jwt.InvalidTokenError as e:
        jwt_validations_total.labels(result="invalid_signature").inc()
        raise JWTError("UNAUTHENTICATED", detail=str(e)) from e

    jti = claims.get("jti")
    if await _is_revoked(jti):
        jwt_validations_total.labels(result="revoked").inc()
        raise JWTError("TOKEN_REVOKED", detail="token_revoked")

    jwt_validations_total.labels(result="success").inc()

    return Principal(
        user_id=str(claims.get("sub", "")),
        tenant_id=claims.get("tenant_id"),
        global_role=claims.get("global_role"),
        course_roles=dict(claims.get("course_roles") or {}),
        jti=jti,
        raw_claims=claims,
    )


__all__ = ["Principal", "JWTError", "validate_token", "REVOKE_LIST_KEY"]


# silence unused-import
_ = PyJWKClient
