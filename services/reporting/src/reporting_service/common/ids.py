"""Prefixed ULID-style IDs for resources (export_id, op_id, schedule_id)."""
from __future__ import annotations

import secrets
import time

_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"


def _ulid_like() -> str:
    ms = int(time.time() * 1000)
    rand = secrets.token_bytes(10)
    high = ms.to_bytes(6, "big")
    raw = high + rand
    out = []
    bits = 0
    bitcount = 0
    for byte in raw:
        bits = (bits << 8) | byte
        bitcount += 8
        while bitcount >= 5:
            bitcount -= 5
            out.append(_ALPHABET[(bits >> bitcount) & 0x1F])
    if bitcount:
        out.append(_ALPHABET[(bits << (5 - bitcount)) & 0x1F])
    return "".join(out)[:26]


def new_id(prefix: str) -> str:
    return f"{prefix}{_ulid_like().lower()}"


def new_export_id() -> str:
    return new_id("exp_")


def new_operation_id() -> str:
    return new_id("op_")


def new_schedule_id() -> str:
    return new_id("sch_")


def new_snapshot_id() -> str:
    return new_id("snap_")
