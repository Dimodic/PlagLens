"""ID generation: ULID for AuditEvent, prefixed UUIDs for the rest."""
from __future__ import annotations

import uuid

from ulid import ULID


def new_ulid() -> str:
    """26-char Crockford-base32 ULID (monotonic when possible)."""
    return str(ULID())


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def retention_id() -> str:
    return gen_id("ret")


def legal_hold_id() -> str:
    return gen_id("lhd")
