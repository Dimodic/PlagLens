"""JWT verification (verify-only mode — public key)."""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from ..config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _public_key() -> bytes:
    if settings.jwt_public_key:
        return settings.jwt_public_key.encode("utf-8")
    p = Path(settings.jwt_public_key_path)
    if p.exists():
        return p.read_bytes()
    # Dev fallback: ephemeral key — JWT verification will then fail unless
    # ``settings.auth_disabled`` is true. We synthesize one so unit tests can
    # mint a valid token for verification with the same key.
    logger.warning("Generating ephemeral RS256 public key (dev only)")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return pub_pem


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(
        token,
        _public_key(),
        algorithms=[settings.jwt_alg],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
    )
