"""JWT (RS256) issue + verify, JWKS, password hashing, secret encryption.

For local/dev use, RS256 keys are generated on first call and cached on disk
when the configured key paths are missing. In prod, paths point to mounted
secrets (Vault/CSI driver).
"""
from __future__ import annotations

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from ..config import settings

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- #
# Argon2id
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def password_hasher() -> PasswordHasher:
    return PasswordHasher(
        time_cost=settings.argon2_time_cost,
        memory_cost=settings.argon2_memory_kib,
        parallelism=settings.argon2_parallelism,
        hash_len=settings.argon2_hash_len,
    )


def hash_password(password: str) -> str:
    return password_hasher().hash(password)


def verify_password(password: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return password_hasher().verify(hashed, password)
    except VerifyMismatchError:
        return False
    except Exception:
        return False


# --------------------------------------------------------------------------- #
# RS256 keys + JWKS
# --------------------------------------------------------------------------- #
def _ensure_keys() -> tuple[bytes, bytes]:
    """Read RS256 keypair from disk; create one if missing (dev convenience)."""
    priv = Path(settings.jwt_private_key_path)
    pub = Path(settings.jwt_public_key_path)
    if priv.exists() and pub.exists():
        return priv.read_bytes(), pub.read_bytes()

    logger.warning("Generating ephemeral RS256 keypair at %s", priv)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    priv_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    try:
        priv.parent.mkdir(parents=True, exist_ok=True)
        priv.write_bytes(priv_pem)
        pub.write_bytes(pub_pem)
    except OSError:
        # Read-only FS — keep in-memory only.
        pass
    return priv_pem, pub_pem


@lru_cache(maxsize=1)
def get_keys() -> tuple[bytes, bytes]:
    return _ensure_keys()


def issue_access_token(
    *,
    user_id: str,
    tenant_id: str,
    global_role: str,
    course_roles: Optional[dict[str, str]] = None,
    extra_claims: Optional[dict[str, Any]] = None,
) -> str:
    priv, _ = get_keys()
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "sub": user_id,
        "tenant_id": tenant_id,
        "global_role": global_role,
        "course_roles": course_roles or {},
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_access_ttl_seconds)).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(
        payload,
        priv,
        algorithm=settings.jwt_alg,
        headers={"kid": settings.jwt_kid, "typ": "JWT"},
    )


def decode_access_token(token: str) -> dict[str, Any]:
    _, pub = get_keys()
    return jwt.decode(
        token,
        pub,
        algorithms=[settings.jwt_alg],
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
    )


def _b64url_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def jwks() -> dict[str, Any]:
    _, pub_pem = get_keys()
    public_key = serialization.load_pem_public_key(pub_pem)
    numbers = public_key.public_numbers()  # type: ignore[union-attr]
    return {
        "keys": [
            {
                "kty": "RSA",
                "use": "sig",
                "alg": settings.jwt_alg,
                "kid": settings.jwt_kid,
                "n": _b64url_uint(numbers.n),
                "e": _b64url_uint(numbers.e),
            }
        ]
    }


# --------------------------------------------------------------------------- #
# Refresh tokens (opaque, hashed at rest)
# --------------------------------------------------------------------------- #
def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# Generic opaque tokens (password-reset, email-verify, invitations, API keys)
# --------------------------------------------------------------------------- #
def new_opaque_token(prefix: str = "") -> str:
    raw = secrets.token_urlsafe(32)
    return f"{prefix}{raw}" if prefix else raw


# --------------------------------------------------------------------------- #
# Fernet for 2FA secrets (DEK; KEK in Vault later)
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def fernet() -> Fernet:
    key = settings.totp_fernet_key
    if not key:
        # Derive a deterministic dev key from process so tests are reproducible.
        material = hashlib.sha256(b"plaglens-dev-fernet").digest()
        key = base64.urlsafe_b64encode(material).decode("ascii")
        os.environ["TOTP_FERNET_KEY"] = key
    return Fernet(key.encode("ascii") if isinstance(key, str) else key)


def encrypt_secret(plaintext: str) -> bytes:
    return fernet().encrypt(plaintext.encode("utf-8"))


def decrypt_secret(ciphertext: bytes) -> str:
    return fernet().decrypt(ciphertext).decode("utf-8")
