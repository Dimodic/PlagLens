"""HMAC-SHA256 signature verification."""
from __future__ import annotations

import hashlib
import hmac


def compute_hmac_sha256(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def verify_signature(secret: str, payload: bytes, signature: str) -> bool:
    if not signature:
        return False
    sig = signature.lower().removeprefix("sha256=")
    expected = compute_hmac_sha256(secret, payload)
    try:
        return hmac.compare_digest(sig, expected)
    except Exception:
        return False
