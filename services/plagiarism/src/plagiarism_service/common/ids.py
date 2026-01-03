"""Short, prefixed, lexically-sortable IDs.

We use ULID-style time-prefix base32 for readable IDs. For test determinism a
seed can be injected.
"""
from __future__ import annotations

import secrets
import time

_ALPHABET = "0123456789abcdefghijklmnopqrstuv"


def _b32(value: int, width: int) -> str:
    out = []
    for _ in range(width):
        out.append(_ALPHABET[value & 0x1F])
        value >>= 5
    return "".join(reversed(out))


def new_id(prefix: str, *, length: int = 16) -> str:
    """Generate a new ID like ``plg_8b7c1f2d``.

    First 6 chars encode 30 ms-resolution bits of the current timestamp
    (lexically sortable); the rest are random. Total ID length = ``len(prefix) + 1 + length``.
    """
    ts = int(time.time() * 1000) & ((1 << 30) - 1)
    rand_bits = (length - 6) * 5
    rand = secrets.randbits(rand_bits)
    return f"{prefix}_{_b32(ts, 6)}{_b32(rand, length - 6)}"


def run_id() -> str:
    return new_id("plg")


def pair_id() -> str:
    return new_id("pair")


def cluster_id() -> str:
    return new_id("clu")


def corpus_id() -> str:
    return new_id("cor")


def flag_id() -> str:
    return new_id("flg")


def webhook_id() -> str:
    return new_id("whk")


def provider_config_id() -> str:
    return new_id("pcf")


def event_id() -> str:
    return new_id("evt")
