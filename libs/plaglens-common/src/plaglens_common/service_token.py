"""Service-to-service JWT minting (shared).

Centralizes the previously-duplicated ``_service_token`` helpers that lived in
plagiarism, ai-analysis and identity. Mints a short-lived admin-scoped RS256
JWT signed with the shared private key, with a small per-(subject, tenant) TTL
cache so hot background paths don't re-sign on every call.

SECURITY NOTE: this forges an ``admin`` principal using the *shared* signing
key, which couples every caller to identity's key material. The longer-term fix
is to prefer identity-issued service tokens (POST /auth/service-token via
``X-Service-Secret``) — as integration and reporting already do — to shrink the
blast radius. This helper keeps today's behavior but in ONE place, so that swap
later happens here, not in five copies.
"""
from __future__ import annotations

import os
import time
from typing import Any

import jwt as _jwt

# (subject, tenant_id) -> (token, exp_epoch)
_CACHE: dict[tuple[str, str], tuple[str, float]] = {}
_DEFAULT_TTL_S = 15 * 60


def mint_service_jwt(
    *,
    subject: str,
    tenant_id: str,
    ttl_seconds: int = _DEFAULT_TTL_S,
    global_role: str = "admin",
    extra_claims: dict[str, Any] | None = None,
) -> str | None:
    """Return a signed service JWT for s2s calls, or ``None`` if the private
    key can't be loaded (caller then falls back to unauthenticated → 401 in
    dev, but never raises).

    Cached per ``(subject, tenant_id)`` until ~60s before expiry.
    """
    now = time.time()
    ck = (subject, tenant_id)
    cached = _CACHE.get(ck)
    if cached is not None and cached[1] > now + 60:
        return cached[0]

    key_path = os.environ.get("JWT_PRIVATE_KEY_PATH") or "/run/secrets/jwt_private.pem"
    try:
        with open(key_path, encoding="utf-8") as fh:
            private_key = fh.read()
    except OSError:
        return None

    issuer = os.environ.get("JWT_ISSUER") or "https://plaglens.local"
    audience = os.environ.get("JWT_AUDIENCE") or "plaglens-api"
    algorithm = os.environ.get("JWT_ALGORITHM") or "RS256"
    iat = int(now)
    exp = iat + ttl_seconds
    payload: dict[str, Any] = {
        "sub": subject,
        "iss": issuer,
        "aud": audience,
        "iat": iat,
        "exp": exp,
        "tenant_id": tenant_id,
        "global_role": global_role,  # service principal — bypasses RBAC
        "course_roles": {},
    }
    if extra_claims:
        payload.update(extra_claims)
    try:
        token = _jwt.encode(payload, private_key, algorithm=algorithm)
    except Exception:
        return None
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    _CACHE[ck] = (token, float(exp))
    return token


__all__ = ["mint_service_jwt"]
