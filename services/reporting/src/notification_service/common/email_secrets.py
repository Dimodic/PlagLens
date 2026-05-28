"""Symmetric encryption for SMTP / Mailgun secrets stored in the DB.

Fernet-based: ``cryptography.fernet.Fernet`` provides authenticated
symmetric encryption with a single URL-safe base64-encoded 32-byte key.
The key lives in ``settings.EMAIL_SECRET_KEY`` (env: ``EMAIL_SECRET_KEY``).

Why per-secret encryption instead of a Vault reference: the platform
deliberately ships without an external secrets manager (an academic
project shouldn't require Vault to be running). Fernet + a single env-
provided key is the lightest production-grade alternative — rotation is
re-encrypting all rows with a new key.

If the key is missing, ``encrypt`` raises so the PATCH endpoint can
return a 503 instead of silently storing plaintext. ``decrypt`` returns
``None`` on a missing key — channels then fall back to env credentials
(useful in local where the DB row was sealed with a different key).
"""
from __future__ import annotations

import logging
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from notification_service.config import get_settings

log = logging.getLogger(__name__)


def _fernet() -> Optional[Fernet]:
    key = (get_settings().EMAIL_SECRET_KEY or "").strip()
    if not key:
        return None
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, TypeError):
        log.warning("EMAIL_SECRET_KEY is set but not a valid Fernet key")
        return None


class EmailSecretsUnavailable(RuntimeError):
    """Raised by encrypt() when no Fernet key is configured.

    Surfaced from the admin PATCH endpoint as a 503 so operators see a
    clear «set EMAIL_SECRET_KEY first» instead of a silent failure.
    """


def encrypt(plaintext: str) -> bytes:
    f = _fernet()
    if f is None:
        raise EmailSecretsUnavailable(
            "EMAIL_SECRET_KEY is not configured — cannot store encrypted secrets"
        )
    return f.encrypt(plaintext.encode("utf-8"))


def decrypt(ciphertext: bytes | None) -> str | None:
    if not ciphertext:
        return None
    f = _fernet()
    if f is None:
        log.warning("decrypt(): no EMAIL_SECRET_KEY — returning None")
        return None
    try:
        return f.decrypt(ciphertext).decode("utf-8")
    except InvalidToken:
        log.warning("decrypt(): ciphertext doesn't match current EMAIL_SECRET_KEY")
        return None
